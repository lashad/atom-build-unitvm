'use babel';

import ListView from './listview-view';

import fs from 'fs';
import { existsSync, watch } from 'fs';
import path from 'path';
import { lookpath } from 'lookpath';
import voucher from 'voucher';
import { EventEmitter } from 'events';
const temp = require("temp").track();
const yaml = require('js-yaml');
import { satisfyDependencies } from 'atom-satisfy-dependencies';


import { CompositeDisposable, Disposable } from 'atom';
import { createStatusBarItem } from "./status-bar";
import { createListView } from "./listview-view";
import { decompile, listPorts } from "./cli";
import { getYamlConfig, writeConfig } from "./utils";
export const config = require('./config');
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
            return 'UnitVM Build';
        }

        isEligible() {

            this.file = path.join(this.cwd, defaultConfigFileName);

            if (atom.config.get('build-unitvm.alwaysEligible') === true) {
                console.log('Always eligible');
                return true;
            }

            return existsSync(this.file);
        }

        getFiles(outDirName, filter) {
            return Array.prototype.map.call(atom.project.getDirectories()[0].getSubdirectory(outDirName).getEntriesSync(),
                function (item) { return item.getPath(); }).filter(function (fileName) {
                    return fileName.endsWith(filter);
                });
        }

        getConfig() {

            if (!existsSync(this.file)) {
                this.file = undefined;
                return undefined;
            }

            return yaml.load(fs.readFileSync(this.file, 'utf8'));
        }

        settings() {


            const OUT_DIR = atom.config.get('build-unitvm.buildOutDir');
            const SRC_DIR = atom.config.get('build-unitvm.buildSrcDir');

            let yamlConfig = instance.getConfig();
            let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir'); //'/Users/lashadolidze/MyProjects/Darjeeling-VM/UnitVM/unitkit32';
            let cmduvmb = path.join(UNITVM_KIT_HOME, 'bin/uvmb');
            let uvmbargs = [`-o ${OUT_DIR}`];
            let avrdudeArgs = ['-c arduino', '-p atmega328p', '-b57600', '-P /dev/cu.usbserial'];
            const findPattern = `\\( -name '*.class' -o -name '*.uvmy' -o -name '*.hex' -o -name '*.uvm' \\)`;

            /* Update settings when config file changes */
            if (this.file !== undefined) {
                const refresh = new Date();
                this.fileWatcher = watch(this.file, () => {
                    if (new Date() - refresh > 3000) {
                        this.emit('refresh');
                    }
                });
            }
            /* ------------------------- */

            post = function (success) {
                instance.emit('refresh');
                if (success) {
                    atom.notifications.addSuccess("UnitVM compile successful");
                }
                else {
                    atom.notifications.addError("UnitVM compile failed");
                }

                atom.commands.dispatch(
                  atom.views.getView(atom.workspace),
                  'unitvm-build:upload'
                );
            };

            if (yamlConfig !== undefined) {

                if (yamlConfig.eui64) {
                    uvmbargs.push(`-e ${yamlConfig.eui64}`);
                }

                if (yamlConfig.name) {
                    uvmbargs.push(`-n ${yamlConfig.name}`);
                }

                if(yamlConfig.avrdude) {
                    if(yamlConfig.avrdude.mcu) {
                        avrdudeArgs[1] = `-p ${yamlConfig.avrdude.mcu}`;
                    }
                    if(yamlConfig.avrdude.bps) {
                        avrdudeArgs[2] = `-b ${yamlConfig.avrdude.bps}`;
                    }
                    if(yamlConfig.avrdude.port) {
                        avrdudeArgs[3] = `-P ${yamlConfig.avrdude.port}`;
                    }
                }

            }

            let outs = instance.getFiles(OUT_DIR, ".hex");

            if(outs.length > 0) {
              avrdudeArgs.push(`-U flash:w:${outs[0]}`);
            }

            uvmbargs.push(`${SRC_DIR}`);

            const uvmbTarget = {
                postBuild: post,
                exec: `${cmduvmb}`,
                name: 'UnitVM Build: Compile Java',
                args: uvmbargs,
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:build'
            };

            const uploadDeviceTarget = {
                // postBuild: post,
                exec: 'avrdude',
                name: 'UnitVM Build: Upload to device',
                args: avrdudeArgs,
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:upload'
            };

            const cleanBuildTarget = {
                // postBuild: post,
                exec: `find`,
                name: 'UnitVM Build: Clean',
                args: [OUT_DIR, '-type f', findPattern, '-exec rm -f {} \\;'],
                cwd: this.cwd,
                sh: true,
                atomCommandName: 'unitvm-build:clean'
            };

            return [uvmbTarget, uploadDeviceTarget, cleanBuildTarget];

        }
    };
}

export function activate(state) {
    let instance = this;
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
      'build-unitvm:selectMCU': () => this.selectMCU()
    }));

    // This package depends on build, make sure it's installed
    if (atom.config.get('build-unitvm.manageDependencies') === true) {
        satisfyDependencies('build-unitvm');
    }
}

export function deactivate() {
    console.log('Deactivating package');
    // this.serialListView.destroy();
}

export function serialize() {
  // return {
  //   serialListViewState: this.serialListView.serialize()
  // };
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
        // statusBarItem.setPort(newPort);
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

export function consumeStatusBar(statusBar) {

  // let view = atom.views.getView(atom.workspace);
  console.log(atom.commands);

    statusBarItem = createStatusBarItem();
    statusBarItem.onClick((ev) => {

      atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        'unitvm-build:build'
      );
    });
    statusBarItem.onRightClick((ev) => {
      atom.commands.dispatch(
        atom.views.getView(atom.workspace),
        "build-unitvm:selectSerialPort"
      );
    });

    // statusBarItem.setPort('currentBoard');

    const tile = statusBar.addLeftTile({ item: statusBarItem, priority: 200 });
    subscriptions.add(new Disposable(() => tile.destroy()));
}

/* -------------------------------------------------------------------------------- */
