"use babel";

import path from 'path';
import fs from 'fs';
const yaml = require('js-yaml');
const defaultConfigFileName = '.unitvm-build.yml';

export const getProjectDirectory = () =>
  atom.project.rootDirectories[0].getPath();

export const getCliCommand = (command) => {

  let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir');

  if(command == 'uvmp') {
    return path.join(UNITVM_KIT_HOME, 'bin/uvmp');
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

export const writeConfig = (cfg) => {
  let filePath = path.join(getProjectDirectory(), defaultConfigFileName);
  fs.writeFileSync(filePath, yaml.dump(cfg), 'utf8');
}
