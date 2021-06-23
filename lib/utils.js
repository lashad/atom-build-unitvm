"use babel";

import path from 'path';
import fs from 'fs';
const yaml = require('js-yaml');
import randomBytes from 'random-bytes';
const defaultConfigFileName = '.unitvm-build.yml';

export const getProjectDirectory = () => {
    if (atom.project.rootDirectories[0] !== undefined) {
        return atom.project.rootDirectories[0].getPath();
    }
    return "";
}

export const getCliCommand = (command) => {

    let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir');

    if (command === 'uvmb') {
        return path.join(UNITVM_KIT_HOME, 'bin', 'uvmb');
    } else if (command === 'uvmp') {
        return path.join(UNITVM_KIT_HOME, 'bin', 'uvmp');
    } else if (command === 'uvmports') {
        return path.join(UNITVM_KIT_HOME, 'bin', 'uvmports');
    }

    return command;
}

export const getYamlConfig = () => {

    let cfg = {
        avrdude: {
            mcu: atom.config.get('build-unitvm.defaultMcuName'),
            bps: atom.config.get('build-unitvm.defaultBps'),
            port: 'N/A'
        }
    };

    let filePath = path.join(getProjectDirectory(), defaultConfigFileName);
    if (fs.existsSync(filePath)) {
        cfg = yaml.load(fs.readFileSync(filePath), 'utf8');
    }

    return cfg;
}

export const configExists = () => {
    let filePath = path.join(getProjectDirectory(), defaultConfigFileName);
    return fs.existsSync(filePath);
}

export const writeConfig = (cfg) => {
    let filePath = path.join(getProjectDirectory(), defaultConfigFileName);
    fs.writeFileSync(filePath, yaml.dump(cfg), 'utf8');
}

export const getFiles = (dir, filter) => {
    return Array.prototype.map.call(atom.project.getDirectories()[0].getSubdirectory(dir).getEntriesSync(),
        function (item) { return item.getPath(); }).filter(function (fileName) {
            return fileName.endsWith(filter);
        });
}

export const getUnitKitPath = (append) => {
    let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir');
    return path.join(UNITVM_KIT_HOME, `${append}`);
}

export const setUnitKitPath = (unitKitPath) => {

    let releaseYaml = undefined;
    let filePath = path.join(unitKitPath, "release.yaml");
    if (fs.existsSync(filePath)) {
        releaseYaml = yaml.load(fs.readFileSync(filePath), 'utf8');
    }
    
    if(releaseYaml !== undefined && releaseYaml.Version !== undefined) {
        atom.config.set('build-unitvm.unitvmKitHomeDir', unitKitPath);
        return releaseYaml.Version;
    }

    return undefined;
}

export const checkUnitKitPath = () => {
    let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir');
    if (fs.existsSync(UNITVM_KIT_HOME)) {
        return true;
    }

    return false;
}

export const decimalToHex = (d, padding) => {
    var hex = Number(d).toString(16);
    padding = typeof (padding) === "undefined" || padding === null ? padding = 2 : padding;

    while (hex.length < padding) {
        hex = "0" + hex;
    }

    return hex;
}

export const generateEUI64 = () => {
    let eui64 = randomBytes.sync(8);
    return decimalToHex(eui64[0]).toUpperCase() + ":" +
        decimalToHex(eui64[1]).toUpperCase() + ":" +
        decimalToHex(eui64[2]).toUpperCase() + ":" +
        decimalToHex(eui64[3]).toUpperCase() + ":" +
        decimalToHex(eui64[4]).toUpperCase() + ":" +
        decimalToHex(eui64[5]).toUpperCase() + ":" +
        decimalToHex(eui64[6]).toUpperCase() + ":" +
        decimalToHex(eui64[7]).toUpperCase();
}