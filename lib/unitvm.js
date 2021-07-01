'use babel';

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
const temp = require("temp").track();
import { satisfyDependencies } from 'atom-satisfy-dependencies';
import { CompositeDisposable, Disposable } from 'atom';
import { createStatusBarItem } from "./status-bar";
import { createListView } from "./listview-view";
import { decompile, listFiles, listPorts, upload } from "./cli";
import {
    getCliCommand, getYamlConfig,
    writeConfig, getFiles, getUnitKitPath,
    setUnitKitPath, getProjectDirectory,
    checkUnitKitPath, getResourceSchemaPath, configExists, generateEUI64, getConfigPath
} from "./utils";
const os = require('os');
export const config = require('./config');
const { shell } = require('electron');
const { remote } = require('electron');

const kitFileName = "unitkit.zip";
const defaultConfigFileName = '.unitvm-build.yml';
let statusBarItem;
let subscriptions;
let builderInstance;

export function provideBuilder() {
    const errorMatch = [
        '(?<file>/[^:\\n]+\\.java):(?<line>\\d+):',
        '(?::compile(?:Api)?(?:Java))?(?<file>.+):(?<line>\\d+):\\s.+[;:]'
    ];

    return class UnitVMBuildProvider extends EventEmitter {
        constructor(cwd) {
            super();
            builderInstance = this;
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

            const cfg = getYamlConfig();
            const OUT_DIR = atom.config.get('build-unitvm.buildOutDir');
            const SRC_DIR = atom.config.get('build-unitvm.buildSrcDir');

            let uvmbargs = [`-o ${OUT_DIR}`];
            let avrdudeArgs = ['-c arduino'];

            statusBarItem.setSuccess("Build & Upload");
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
                builderInstance.emit('refresh');
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
                if (success) {
                    atom.commands.dispatch(
                        atom.views.getView(atom.workspace),
                        'unitvm-build:upload'
                    );
                }
            };

            if (cfg.eui64 !== undefined) {
                uvmbargs.push(`-e ${cfg.eui64}`);
            }

            if (cfg.name !== undefined) {
                uvmbargs.push(`-n ${cfg.name}`);
            }

            const resourceSchemaPath = getResourceSchemaPath();
            if (resourceSchemaPath) {
                uvmbargs.push(`-r ${resourceSchemaPath}`);
            }

            uvmbargs.push(`${SRC_DIR}`);

            if (cfg.avrdude.mcu !== undefined) {
                avrdudeArgs.push(`-p ${cfg.avrdude.mcu}`);
            }

            if (cfg.avrdude.bps !== undefined) {
                avrdudeArgs.push(`-b ${cfg.avrdude.bps}`);
            }

            if (cfg.avrdude.port !== undefined) {
                avrdudeArgs.push(`-P ${cfg.avrdude.port}`);
            }

            let outs = getFiles(OUT_DIR, ".hex");

            if (outs.length > 0) {
                avrdudeArgs.push(`-U flash:w:${outs[0]}:i`);
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

            let cleanBuildTarget;
            if (/^win/.test(process.platform)) {
                cleanBuildTarget = {
                    postBuild: postClean,
                    exec: `del`,
                    name: 'UnitVM: Clean',
                    args: [`/s /q ${OUT_DIR}\\*.class ${OUT_DIR}\\*.uvmy ${OUT_DIR}\\*.hex ${OUT_DIR}\\*.uvm`],
                    cwd: this.cwd,
                    sh: true,
                    atomCommandName: 'unitvm-build:clean'
                };
            } else {
                cleanBuildTarget = {
                    postBuild: postClean,
                    exec: `find`,
                    name: 'UnitVM: Clean',
                    args: [OUT_DIR, '-type f', `\\( -name '*.class' -o -name '*.uvmy' -o -name '*.hex' -o -name '*.uvm' \\)`, '-exec rm -f {} \\;'],
                    cwd: this.cwd,
                    sh: true,
                    atomCommandName: 'unitvm-build:clean'
                };
            }

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

    atom.workspace.addOpener(function (uri) {
        if (path.extname(uri) === ".uvmy") {
            return instance.disassemble(uri);
        }
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    subscriptions = new CompositeDisposable();

    // Register command that selectSerialPort this view
    subscriptions.add(atom.commands.add('atom-workspace', {
        'build-unitvm:newUnitVMProject': () => this.newUnitVMProject(),
        'build-unitvm:selectSerialPort': () => this.selectSerialPort(),
        'build-unitvm:selectSerialSpeed': () => this.selectSerialSpeed(),
        'build-unitvm:selectMCU': () => this.selectMCU(),
        'build-unitvm:viewApi': () => this.viewApi(),
        'build-unitvm:selectDocs': () => this.selectDocs(),
        'build-unitvm:unitkitHome': () => this.unitkitHome(),
        'build-unitvm:unitkitSetHome': () => this.unitkitSetHome(),
        'build-unitvm:installUpdateUnitKitFramework': () => this.installUpdateUnitKitFramework(),
        'build-unitvm:selectFirmware': () => this.selectFirmware()
    }));

    // This package depends on build, make sure it's installed
    if (atom.config.get('build-unitvm.manageDependencies') === true) {
        satisfyDependencies('build-unitvm');
    }

    /* 
     * This is a hack and indeed not my fault. 
     * There is no way to insert menu in specific position.
     * So we need to inject in runtime object our menu item to get the correctly order.
     * The 'New UnitVM Project' menu item should be after 'New File' item.
     */
    // console.log(process.platform);
    let index = 0;
    if (/^darwin/.test(process.platform)) {
        index = 1;
    }
    atom.menu.template[index].submenu.splice(2, 0, {
        label: "New UnitVM Project",
        command: "build-unitvm:newUnitVMProject"
    });

}

/* -------------------------------------------------------------------------------- */

export function selectDocs() {

    let submenu = atom.menu.template.filter(menu => menu.label == "Packages");
    submenu = submenu[0].submenu.filter(menu => menu.label == "UnitVM");
    submenu = submenu[0].submenu.filter(menu => menu.label == "UnitKit Framework");

    listFiles(getUnitKitPath(path.join('docs', 'files'))).then((stdout) => {
        let names = stdout.split("\n");
        names.pop();
        let firmwareListView = createListView(names, "", "There is no files in 'pinouts' directory");
        firmwareListView.awaitSelection().then(name => {
            shell.openPath(getUnitKitPath(path.join('docs', 'files', name)));
            firmwareListView = null;
        }).catch((err) => {
            atom.notifications.addError(err.message);
            firmwareListView.setError(err.message);
            firmwareListView = null;
        });
    }).catch((err) => {
        atom.notifications.addWarning(err);
    });
}

/* -------------------------------------------------------------------------------- */

export function deactivate() {
    console.log('Deactivating package');
    this.subscriptions.dispose();
    this.webviews.forEach(wv => {
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
    shell.openPath(getUnitKitPath(path.join('docs', 'apidocs', 'index.html')));
}

/* -------------------------------------------------------------------------------- */

export function unitkitHome() {
    shell.beep();
    shell.showItemInFolder(getUnitKitPath(''));
}

/* -------------------------------------------------------------------------------- */

export function unitkitSetHome() {

    const message = 'Choose UnitKit Directory';
    let filePaths = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
        message: message,
        buttonLabel: 'Choose',
        properties: ['openDirectory']
    });
    if (filePaths !== undefined) {
        const unitkitVersion = setUnitKitPath(filePaths[0]);
        if (unitkitVersion !== undefined) {
            atom.notifications.addSuccess(`UnitKit version ${unitkitVersion}`);
        } else {
            atom.notifications.addError(`Directory '${filePaths[0]}' is not a valid UnitKit Framework`);
        }
    }
}

/* -------------------------------------------------------------------------------- */

export function newUnitVMProject() {

    const message = 'Choose the directory where you want to create project files';
    let filePaths = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
        message: message,
        buttonLabel: 'Choose',
        properties: ['createDirectory', 'openDirectory', 'promptToCreate']
    });

    if (filePaths !== undefined) {
        let projectDirectory = filePaths[0];

        if (!fs.existsSync(projectDirectory)) {
            fs.mkdirSync(projectDirectory);
        }

        let srcDirectory = path.join(projectDirectory, 'src');
        if (!fs.existsSync(srcDirectory)) {
            fs.mkdirSync(srcDirectory);
        }

        let mainDirectory = path.join(srcDirectory, 'main');
        if (!fs.existsSync(mainDirectory)) {
            fs.mkdirSync(mainDirectory);
        }

        let javaDirectory = path.join(mainDirectory, 'java');
        if (!fs.existsSync(javaDirectory)) {
            fs.mkdirSync(javaDirectory);
        }

        let res = path.parse(projectDirectory);
        let appName = path.join(javaDirectory, res.name);
        let appFileName = appName + '.java';
        let eui64Str = generateEUI64();
        const nowDate = new Date();

        let template = "/**\n" +
            " *  " + res.name + ".java\n" +
            " *\n" +
            " *  Created by " + os.userInfo().username + " on " + nowDate.toLocaleDateString() + "\n" +
            " */\n\n" +
            "import javax.unitvm.Const;\n" +
            "import javax.unitvm.Port;\n" +
            "import javax.unitvm.Device;\n" +
            "import java.lang.annotation.EUI64;\n" +
            "\n" +
            "/* This is auto-generated application EUI-64 identifier. */\n" +
            "@EUI64(id = \"" + eui64Str + "\")\n" +
            "class " + res.name + " {\n\n" +
            "   public static void main(String[] args) {\n" +
            "     System.out.println(\"Hello " + res.name + "\");\n" +
            "   }\n\n" +
            "}\n";


        fs.writeFile(appFileName, template, function (err) {
            if (err) {
                atom.notifications.addError(err);
            } else {

                /* Add path to project */
                atom.project.addPath(projectDirectory);

                /* Open application java file */
                atom.workspace.open(appFileName);

                /* Create build configuration file */
                let cfg = getYamlConfig();
                cfg.name = res.name;
                cfg.eui64 = generateEUI64();
                writeConfig(cfg);

                /* Notify 'build' package to select active targets */
                setTimeout(function () {
                    atom.commands.dispatch(
                        atom.views.getView(atom.workspace),
                        'build:refresh-targets'
                    );
                }, 2000);

                /* Expand Tree-View */
                Promise.resolve(atom.packages.activatePackage('tree-view'))
                    .then(({ mainModule: treeViewModule }) => {
                        treeViewModule.treeView.entryForPath(javaDirectory).expand();
                    });
            }
        });

    }
}

/* -------------------------------------------------------------------------------- */

export function selectSerialPort() {

    let cfg = getYamlConfig();
    let arg = "";
    let emptyMessage = "";

    if (/^darwin/.test(process.platform)) {
        emptyMessage = "No ports found (/dev/cu*)";
    } else if (/^linux/.test(process.platform)) {
        emptyMessage = "No ports found (/dev/ttyA* /dev/ttyUSB*)";
    } else {
        emptyMessage = "No ports found (COM*)";
    }

    listPorts(arg).then((stdout) => {
        let names = stdout.split("\n");
        names.pop();
        let portListView = createListView(names, cfg.avrdude.port, emptyMessage);
        portListView.awaitSelection().then(newPort => {
            cfg.avrdude.port = newPort;
            writeConfig(cfg);
            portListView = null;
        }).catch((err) => {
            atom.notifications.addError(err.message);
            portListView.setError(err.message);
            portListView = null;
        });
    }).catch((err) => {
        atom.notifications.addError(err);
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
        atom.notifications.addError(err.message);
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
        atom.notifications.addError(err.message);
        mcuListView.setError(err.message);
        mcuListView = null;
    });

}

/* -------------------------------------------------------------------------------- */

export function selectFirmware() {

    let cfg = getYamlConfig();
    let args = getUnitKitPath(path.join('vm'));

    listFiles(args).then((stdout) => {
        let names = stdout.split("\n");
        names.pop();
        let firmwareListView = createListView(names, "", undefined);
        firmwareListView.awaitSelection().then(name => {
            statusBarItem.setSuccess("Burn firmware...");
            upload(cfg.avrdude.mcu, cfg.avrdude.port, cfg.avrdude.bps, path.join(args, name)).then((out) => {
                statusBarItem.clearStatus();
                atom.notifications.addSuccess("UnitVM firmware burn successfuly");
            }).catch((err) => {
                statusBarItem.clearStatus();
                atom.notifications.addError(err);
            });
            firmwareListView = null;
        }).catch((err) => {
            atom.notifications.addError(err.message);
            firmwareListView.setError(err.message);
            firmwareListView = null;
        });
    }).catch((err) => {
        atom.notifications.addError(err);
    });

}

/* -------------------------------------------------------------------------------- */

export function disassemble(uri) {
    return new Promise(function (resolve, reject) {
        decompile(`-d=3 ${uri}`).then((stdout) => {
            temp.open({
                prefix: "unitvm_dis",
                suffix: ".java"
            }, function (err, info) {
                if (!err) {
                    fs.writeFile(info.path, stdout, "UTF-8", function (err) {
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
        }).catch((err) => {
            atom.notifications.addError(err);
            reject();
        });;
    });
}

/* -------------------------------------------------------------------------------- */

export function installUpdateUnitKitFramework() {


    let index = remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
        message: 'Download and Install UnitKit Framework',
        detail: 'Specify the directory where you want to download and install UnitKit Framework',
        buttons: ['Continue', 'Cancel'],
        type: 'question'
    });

    if (index == 0) {
        const message = 'Choose the directory where you want to install UnitKit Framework';
        let filePaths = remote.dialog.showOpenDialogSync(remote.getCurrentWindow(), {
            message: message,
            buttonLabel: 'Choose',
            properties: ['openDirectory']
        });
        if (filePaths !== undefined) {
            const src = `https://aliengreen.ge/${kitFileName}`;
            const dest = path.join(filePaths[0], kitFileName);
            statusBarItem.setSuccess('Downloading...');
            statusBarItem.download(dest, src, filePaths[0]).then((directoryName) => {
                atom.notifications.addSuccess(`Download ${kitFileName} file`);
                atom.notifications.addSuccess(`Unziped ${kitFileName} to the '${filePaths[0]}' directory`);
                statusBarItem.clearStatus();
                const unitkitVersion = setUnitKitPath(path.join(filePaths[0], directoryName));
                if (unitkitVersion !== undefined) {
                    atom.notifications.addSuccess(`UnitKit version ${unitkitVersion}`);
                } else {
                    atom.notifications.addError(`Directory '${directoryName}' is not a UnitKit Framework`);
                }
            }).catch(() => {
                atom.notifications.addError(`Error while downloading ${kitFileName}`);
                statusBarItem.clearStatus();
            });
        }
    }
}

/* -------------------------------------------------------------------------------- */

export function consumeStatusBar(statusBar) {


    statusBarItem = createStatusBarItem();
    statusBarItem.onClick((ev) => {

        /* If we are in project scope */
        if (getProjectDirectory() !== "") {
            if (checkUnitKit()) {
                if (!configExists()) {
                    let index = remote.dialog.showMessageBoxSync({
                        message: `Configuration file '${defaultConfigFileName}' does not exist in current project`,
                        detail: 'Do you want to create new one ?',
                        buttons: ['Create', 'Cancel'],
                        type: 'question'
                    });

                    if (index == 0) {
                        writeConfig(getYamlConfig());
                        atom.commands.dispatch(
                            atom.views.getView(atom.workspace),
                            'build:refresh-targets'
                        );
                    }
                } else {
                    atom.commands.dispatch(
                        atom.views.getView(atom.workspace),
                        'unitvm-build:build-upload'
                    );
                }
            }
        }
    });
    statusBarItem.onRightClick((ev) => {
        if (getProjectDirectory() !== "") {
            if (checkUnitKit()) {
                atom.commands.dispatch(
                    atom.views.getView(atom.workspace),
                    "build-unitvm:selectSerialPort"
                );
            }
        }
    });

    const tile = statusBar.addRightTile({ item: statusBarItem, priority: 200 });
    subscriptions.add(new Disposable(() => tile.destroy()));
}

/* -------------------------------------------------------------------------------- */

export function checkUnitKit() {

    /* Check UnitKit Framework Directory */
    if (!checkUnitKitPath()) {

        let index = remote.dialog.showMessageBoxSync({
            message: 'UnitKit Framework directory is not set',
            detail: 'Please, specify the directory where you want to download and install UnitKit Framework or choose existing UnitKit Framework directory ',
            buttons: ['Download', 'Choose', 'Cancel'],
            type: 'question'
        });

        if (index == 0) {
            installUpdateUnitKitFramework();
        } else if (index == 1) {
            unitkitSetHome();
        }

        return false;
    }

    return true;
}

/* -------------------------------------------------------------------------------- */
