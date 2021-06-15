'use babel';

import ListView from './listview-view';
import { CompositeDisposable } from 'atom';
import fs from 'fs';
import { existsSync, watch } from 'fs';
import path from 'path';
import { lookpath } from 'lookpath';
import { spawn } from "child_process";
import { exec } from 'child_process';
import voucher from 'voucher';
import { EventEmitter } from 'events';
const temp = require("temp").track();
const yaml = require('js-yaml');
import { satisfyDependencies } from 'atom-satisfy-dependencies';
import child_process from "child_process";
export const config = require('./config');

const defaultConfigFileName = '.unitvm-build.yml';

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
                sh: true
            };

            const uploadDeviceTarget = {
                postBuild: post,
                exec: 'avrdude',
                name: 'UnitVM Build: Upload to device',
                args: avrdudeArgs,
                cwd: this.cwd,
                sh: true
            };

            const cleanBuildTarget = {
                postBuild: post,
                exec: `find`,
                name: 'UnitVM Build: Clean',
                args: [OUT_DIR, '-type f', findPattern, '-exec rm -f {} \\;'],
                cwd: this.cwd,
                sh: true
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
    this.subscriptions = new CompositeDisposable();

    // Register command that selectSerialPort this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
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

export function getCurrentPath() {

  let cwd = atom.project.getPaths()[0];
  if(cwd === undefined) {
    atom.notifications.addWarning(`You project is currently empty. Please, open the project and visit me again :)`);
    return undefined;
  }

  return cwd;
}

export function writeConfig(name, value) {

  let cwd = getCurrentPath();
  if(cwd === undefined) {
    return ;
  }


  let cfg = {
      avrdude: {
        mcu: atom.config.get('build-unitvm.defaultMcuName'),
        bps: atom.config.get('build-unitvm.defaultBps'),
        port: 'N/A'
      }
  };

  let cfgFilePath = path.join(cwd, defaultConfigFileName);
  if (existsSync(cfgFilePath)) {
    cfg = yaml.load(fs.readFileSync(cfgFilePath), 'utf8');
  } else {
    atom.notifications.addSuccess(`Create default '${defaultConfigFileName}' file in project directory`);
  }

  atom.notifications.addSuccess(`Serial port '${value}' was selected`);

  cfg.avrdude[name] = value;
  fs.writeFileSync(cfgFilePath, yaml.dump(cfg), 'utf8');

}

export function selectSerialPort() {

  let cwd = getCurrentPath();
  if(cwd === undefined) {
    return ;
  }

  this.serialListView = new ListView();

  this.serialListView.awaitSelection().then(newPort => {
    writeConfig('port', newPort);
    this.serialListView = null;

  }).catch((err) => {
    this.serialListView.setError(err.message);
    this.serialListView = null;
  });

  let cfgFilePath = path.join(cwd, defaultConfigFileName);
  if (existsSync(cfgFilePath)) {
    cfg = yaml.load(fs.readFileSync(cfgFilePath), 'utf8');
    populateListView(this.serialListView, cfg.avrdude.port);
  } else {
    populateListView(this.serialListView);
  }
}

export function selectSerialSpeed() {

  let cwd = getCurrentPath();
  if(cwd === undefined) {
    return ;
  }

  this.serialSpeedListView = new ListView();

  this.serialSpeedListView.awaitSelection().then(bps => {
    writeConfig('bps', bps);
    this.serialSpeedListView = null;

  }).catch((err) => {
    this.serialSpeedListView.setError(err.message);
    this.serialSpeedListView = null;
  });

  let cfgFilePath = path.join(cwd, defaultConfigFileName);
  if (existsSync(cfgFilePath)) {
    cfg = yaml.load(fs.readFileSync(cfgFilePath), 'utf8');
    this.serialSpeedListView.setActiveTarget(cfg.avrdude.bps);
  }

  this.serialSpeedListView.setItems(config.defaultBps.enum);
  this.serialSpeedListView.show();
}

export function selectMCU() {

  let cwd = getCurrentPath();
  if(cwd === undefined) {
    return ;
  }

  this.mcuListView = new ListView();

  this.mcuListView.awaitSelection().then(mcu => {
    writeConfig('mcu', mcu);
    this.mcuListView = null;

  }).catch((err) => {
    this.mcuListView.setError(err.message);
    this.mcuListView = null;
  });

  let cfgFilePath = path.join(cwd, defaultConfigFileName);
  if (existsSync(cfgFilePath)) {
    cfg = yaml.load(fs.readFileSync(cfgFilePath), 'utf8');
    this.mcuListView.setActiveTarget(cfg.avrdude.mcu);
  }

  this.mcuListView.setItems(Array.from(Object.keys(config.defaultMcuName.enum), k => config.defaultMcuName.enum[k].value));
  this.mcuListView.show();
}

export function populateListView(listView, selectedItem) {
  return new Promise(function(resolve, reject) {

      var process = child_process.spawn('ls', ['/dev/cu*'], {shell: true});

      var buffer = "";

      process.stderr.on('data', function(data) {
          buffer += data;
      });

      process.stdout.on('data', function(data) {
          buffer += data;
      });

      process.on('close', function(status) {
          if (status === 0) {
              let names = buffer.split("\n");
              names.pop();
              listView.setActiveTarget(selectedItem);
              listView.setItems(names);
              listView.show();
          } else {
              reject();
          }
      });
  });
}

export function disassemble(uri) {

  return new Promise(function(resolve, reject) {

      let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir');
      let process = child_process.spawn(path.join(UNITVM_KIT_HOME, 'bin/uvmp'), ['-d=3', uri]);

      var buffer = "";

      process.stderr.on('data', function(data) {
          buffer += data;
      });

      process.stdout.on('data', function(data) {
          buffer += data;
      });

      process.on('close', function(status) {
          if (status === 0) {
              temp.open({
                  prefix: "unitvm_dis",
                  suffix: ".java"
              }, function(err, info) {
                  if (!err) {
                      fs.writeFile(info.path, buffer, "UTF-8", function(err) {
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
          }
          else {
              reject();
          }
      });
  });
}
