'use babel';

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
const temp = require("temp").track();
import { satisfyDependencies } from 'atom-satisfy-dependencies';
import { CompositeDisposable, Disposable } from 'atom';
import { createStatusBarItem } from "./status-bar";
import { createListView } from "./listview-view";
import { decompile, listPorts, upload } from "./cli";
import { getCliCommand, getYamlConfig, writeConfig, getFiles, getKitHomeUrl, getProjectDirectory } from "./utils";
export const config = require('./config');
const { shell } = require('electron');
const { remote } = require('electron');
const defaultConfigFileName = '.unitvm-build.yml';
let statusBarItem;
let subscriptions;

export function provideBuilder() {
    const errorMatch = [
        '(?<file>/[^:\\n]+\\.java):(?<line>\\d+):',
        '(?::compile(?:Api)?(?:Java))?(?<file>.+):(?<line>\\d+):\\s.+[;:]'
    ];

    return class UnitVMBuildProvider extends EventEmitter {
        constructor(cwd) {
            super();
            instance = this;
            this.cwd = cwd;
            this.fileWatcher = null;
            atom.config.observe('build-unitvm.jobs', () => this.emit('refresh'));
            atom.config.observe('build-unitvm.unitvmKitHomeDir', () => this.emit('refresh'));
            atom.config.observe('build-unitvm.alwaysEligible', () => this.emit('refresh'));
        }

        getNiceName() {
            return 'UnitVM';
        }

        isEligible() {

            this.file = path.join(this.cwd, defaultConfigFileName);

            if (atom.config.get('build-unitvm.alwaysEligible') === true) {
                console.log('Always eligible');
                return true;
            }

            return fs.existsSync(this.file);
        }

        settings() {

            const OUT_DIR = atom.config.get('build-unitvm.buildOutDir');
            const SRC_DIR = atom.config.get('build-unitvm.buildSrcDir');
            const cfg = getYamlConfig();

            let uvmbargs = [`-o ${OUT_DIR}`];
            let avrdudeArgs = ['-c arduino'];

            statusBarItem.setToopTip(`${cfg.avrdude.mcu} - ${cfg.avrdude.port} (${cfg.avrdude.bps} bps)`);

            /* Update settings when config file changes */
            if (this.file !== undefined) {
                const refresh = new Date();
                this.fileWatcher = fs.watch(this.file, () => {
                    if (new Date() - refresh > 3000) {
                        this.emit('refresh');
                    }
                });
            }
            /* ------------------------- */

            postBuild = function (success) {
                instance.emit('refresh');
                if (success) {
                    atom.notifications.addSuccess("UnitVM build successful");
                }
                else {
                    atom.notifications.addError("UnitVM build failed");
                }
            };

            postUpload = function (success) {
                if (success) {
                    atom.notifications.addSuccess("UnitVM upload successful");
                }
                else {
                    atom.notifications.addError("UnitVM upload failed");
                }
            };

            postClean = function (success) {
                if (success) {
                    atom.notifications.addSuccess("UnitVM clean successful");
                }
                else {
                    atom.notifications.addError("UnitVM clean failed");
                }
            };

            postBuildAndUpload = function (success) {
                postBuild(success);
                atom.commands.dispatch(
                  atom.views.getView(atom.workspace),
                  'unitvm-build:upload'
                );
            };

            if (cfg.eui64 !== undefined) {
                uvmbargs.push(`-e ${cfg.eui64}`);
            }

            if (cfg.name !== undefined) {
                uvmbargs.push(`-n ${cfg.name}`);
            }

            uvmbargs.push(`${SRC_DIR}`);

            if(cfg.avrdude.mcu !== undefined) {
                avrdudeArgs.push(`-p ${cfg.avrdude.mcu}`);
            }

            if(cfg.avrdude.bps !== undefined) {
                avrdudeArgs.push(`-b ${cfg.avrdude.bps}`);
            }

            if(cfg.avrdude.port !== undefined) {
                avrdudeArgs.push(`-P ${cfg.avrdude.port}`);
            }

            let outs = getFiles(OUT_DIR, ".hex");

            if(outs.length > 0) {
              avrdudeArgs.push(`-U flash:w:${outs[0]}`);
            }

            const buildTarget = {
                postBuild: postBuild,
                exec: `${getCliCommand('uvmb')}`,
                name: 'UnitVM: Build Application',
                args: uvmbargs,
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:build'
            };

            const buildAndUploadTarget = {
                postBuild: postBuildAndUpload,
                exec: `${getCliCommand('uvmb')}`,
                name: 'UnitVM: Build & Upload',
                args: uvmbargs,
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:build-upload'
            };

            const uploadDeviceTarget = {
                postBuild: postUpload,
                exec: 'avrdude',
                name: 'UnitVM: Upload to device',
                args: avrdudeArgs,
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:upload'
            };

            const cleanBuildTarget = {
                postBuild: postClean,
                exec: `find`,
                name: 'UnitVM: Clean',
                args: [OUT_DIR, '-type f', `\\( -name '*.class' -o -name '*.uvmy' -o -name '*.hex' -o -name '*.uvm' \\)`, '-exec rm -f {} \\;'],
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:clean'
            };

            return [buildTarget, buildAndUploadTarget, uploadDeviceTarget, cleanBuildTarget];

        }
    };
}

/* -------------------------------------------------------------------------------- */

export function activate(state) {
    let instance = this;
    this.state = state;
    this.webviews = [];

    console.log('Activating package');

    atom.workspace.addOpener(function(uri) {
        if (path.extname(uri) === ".uvmy") {
            return instance.disassemble(uri);
        }
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    subscriptions = new CompositeDisposable();

    // Register command that selectSerialPort this view
    subscriptions.add(atom.commands.add('atom-workspace', {
      'build-unitvm:selectSerialPort': () => this.selectSerialPort(),
      'build-unitvm:selectSerialSpeed': () => this.selectSerialSpeed(),
      'build-unitvm:selectMCU': () => this.selectMCU(),
      'build-unitvm:viewApi': () => this.viewApi(),
      'build-unitvm:unitkitHome': () => this.unitkitHome(),
      'build-unitvm:downloadUnitKitFramework': () => this.downloadUnitKitFramework()
    }));

    // This package depends on build, make sure it's installed
    if (atom.config.get('build-unitvm.manageDependencies') === true) {
        satisfyDependencies('build-unitvm');
    }
}

/* -------------------------------------------------------------------------------- */

export function deactivate() {
    console.log('Deactivating package');
    this.subscriptions.dispose();
    this.webviews.forEach( wv => {
      wv.destroy();
    })
}

/* -------------------------------------------------------------------------------- */

export function serialize() {
      return {
        webviewViewState: this.webviews.map(wv => wv.serialize())
      };
}

/* -------------------------------------------------------------------------------- */

export function viewApi() {
  shell.beep();
  shell.openPath(getKitHomeUrl('docs/apidocs/index.html'));
}

/* -------------------------------------------------------------------------------- */

export function unitkitHome() {
  shell.beep();
  shell.showItemInFolder(getKitHomeUrl(''));
}

/* -------------------------------------------------------------------------------- */

export function selectSerialPort() {

  let cfg = getYamlConfig();

  listPorts(`/dev/cu*`).then((stdout) => {
      let names = stdout.split("\n");
      names.pop();
      let portListView = createListView(names, cfg.avrdude.port);
      portListView.awaitSelection().then(newPort => {
        cfg.avrdude.port = newPort;
        writeConfig(cfg);
        portListView = null;
      }).catch((err) => {
        portListView.setError(err.message);
        portListView = null;
      });
  });

}

/* -------------------------------------------------------------------------------- */

export function selectSerialSpeed() {

  let cfg = getYamlConfig();

  let speedListView = createListView(config.defaultBps.enum, cfg.avrdude.bps);
  speedListView.awaitSelection().then(newBps => {
    cfg.avrdude.bps = newBps;
    writeConfig(cfg);
    speedListView = null;
  }).catch((err) => {
    speedListView.setError(err.message);
    speedListView = null;
  });

}

/* -------------------------------------------------------------------------------- */

export function selectMCU() {

  let cfg = getYamlConfig();

  let mcuListView = createListView(Array.from(Object.keys(config.defaultMcuName.enum), k => config.defaultMcuName.enum[k].value), cfg.avrdude.mcu);
  mcuListView.awaitSelection().then(newMcu => {
    cfg.avrdude.mcu = newMcu;
    writeConfig(cfg);
    mcuListView = null;
  }).catch((err) => {
    mcuListView.setError(err.message);
    mcuListView = null;
  });

}

/* -------------------------------------------------------------------------------- */

export function disassemble(uri) {
  return new Promise(function(resolve, reject) {
    decompile(`-d=3 ${uri}`).then((stdout) => {
      temp.open({
          prefix: "unitvm_dis",
          suffix: ".java"
      }, function(err, info) {
          if (!err) {
              fs.writeFile(info.path, stdout, "UTF-8", function(err) {
                  if (!err) {
                      resolve(atom.workspace.open(info.path));
                  }
                  else {
                      reject();
                  }
              });
          }
          else {
              reject();
          }
      });
    });
  });
}

/* -------------------------------------------------------------------------------- */

export function downloadUnitKitFramework() {

  let index = remote.dialog.showMessageBoxSync({message: 'Download UnitKit Framework',
                                     detail: 'Specify the folder where you want to install UnitKit Framework',
                                     buttons: ['Continue', 'Cancel'],
                                       type: 'question'});

  if(index == 0) {
    let filePaths = remote.dialog.showOpenDialogSync({ properties: ['openDirectory'] });
    if(filePaths !== undefined) {
        const kitfilename = "unitkit.zip";
        const dest = `https://aliengreen.ge/${kitfilename}`;
        const src = filePaths[0] + `/${kitfilename}`;
        statusBarItem.setInfo('Downloading...');
        statusBarItem.download(src, dest, filePaths[0]).then(() => {
          atom.notifications.addSuccess(`Download ${kitfilename} file` );
          atom.notifications.addSuccess(`Unziped ${kitfilename} to the '${filePaths[0]}' directory` );
          statusBarItem.setPort(null);
        }).catch(() => {
            atom.notifications.addError(`Error while downloading ${kitfilename}`);
            statusBarItem.setPort(null);
        });
    }
  }
}

/* -------------------------------------------------------------------------------- */

export function consumeStatusBar(statusBar) {

  let cfg = getYamlConfig();

    statusBarItem = createStatusBarItem();
    statusBarItem.onClick((ev) => {

      atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'unitvm-build:build-upload'
      );

      //
      // let fileName = getFiles(atom.config.get('build-unitvm.buildOutDir'), '.hex');
      //
      // upload(cfg.avrdude.mcu, cfg.avrdude.port, cfg.avrdude.bps, fileName).then((stdout) => {
      //   atom.notifications.addSuccess("UnitVM upload successful");
      // }).catch((err) => {
      //   atom.notifications.addError("UnitVM upload failed");
      // });
    });
    statusBarItem.onRightClick((ev) => {
      atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        "build-unitvm:selectSerialPort"
      );
    });

    const tile = statusBar.addLeftTile({ item: statusBarItem, priority: 200 });
    subscriptions.add(new Disposable(() => tile.destroy()));
}

/* -------------------------------------------------------------------------------- */
