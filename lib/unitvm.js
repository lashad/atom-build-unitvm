'use babel';

import fs from 'fs';
import { existsSync, watch } from 'fs';
import path from 'path';
import os from 'os';
import { lookpath } from 'lookpath';
import { spawn } from "child_process";
import { exec } from 'child_process';
import voucher from 'voucher';
import { EventEmitter } from 'events';
const temp = require("temp").track();
const yaml = require('js-yaml');
import { satisfyDependencies } from 'atom-satisfy-dependencies';

export const config = {
    unitvmKitHomeDir: {
        title: 'UnitVM Kit Home Directory',
        description: 'UnitVM Kit home directory',
        type: 'string',
        default: '~/unitvmkit',
        order: 1
    },
    buildOutDir: {
        title: 'Output Directory',
        description: 'Output directory of build files',
        type: 'string',
        default: 'out',
        order: 2
    },
    buildSrcDir: {
        title: 'Java Source Files Directory',
        description: 'Location of Java source files',
        type: 'string',
        default: 'src/main/java',
        order: 3
    },
    jobs: {
        title: 'Simultaneous jobs',
        description: 'Limits how many jobs make will run simultaneously. Defaults to number of processors. Set to 1 for default behavior of make.',
        type: 'number',
        default: os.cpus().length,
        minimum: 1,
        maximum: os.cpus().length,
        order: 4
    },
    manageDependencies: {
        title: 'Manage Dependencies',
        description: 'When enabled, third-party dependencies will be installed automatically',
        type: 'boolean',
        default: true,
        order: 5
    },
    alwaysEligible: {
        title: 'Always Eligible',
        description: 'The build provider will be available in your project, even when not eligible',
        type: 'boolean',
        default: false,
        order: 6
    }
};

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

            this.file = path.join(this.cwd, '.unitvm-build.yml');

            if (atom.config.get('build-unitvm.alwaysEligible') === true) {
                console.log('Always eligible');
                return true;
            }

            return existsSync(this.file);
        }

        // getFiles(outDirName, filter) {
        //     return Array.prototype.map.call(atom.project.getDirectories()[0].getSubdirectory(outDirName).getEntriesSync(),
        //         function (item) { return item.getPath(); }).filter(function (fileName) {
        //             return fileName.endsWith(filter);
        //         });
        // }

        getConfig() {

            if (!existsSync(this.file)) {
                this.file = undefined;
                return undefined;
            }

            let fileContents = fs.readFileSync(this.file, 'utf8');
            return yaml.load(fileContents);
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

            avrdudeArgs.push(`-U flash:w:${OUT_DIR}/${yamlConfig.name}.hex`);
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

export function activate() {
    console.log('Activating package');

    // This package depends on build, make sure it's installed
    if (atom.config.get('build-unitvm.manageDependencies') === true) {
        satisfyDependencies('build-unitvm');
    }
}

export function deactivate() {
    console.log('Deactivating package');
}
