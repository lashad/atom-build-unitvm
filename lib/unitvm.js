'use babel';

import fs from 'fs';
import { existsSync, watch } from 'fs';
import path from 'path';
import os from 'os';
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
  jobs: {
    title: 'Simultaneous jobs',
    description: 'Limits how many jobs make will run simultaneously. Defaults to number of processors. Set to 1 for default behavior of make.',
    type: 'number',
    default: os.cpus().length,
    minimum: 1,
    maximum: os.cpus().length,
    order: 2
  },
  manageDependencies: {
      title: 'Manage Dependencies',
      description: 'When enabled, third-party dependencies will be installed automatically',
      type: 'boolean',
      default: true,
      order: 3
    },
  alwaysEligible: {
    title: 'Always Eligible',
    description: 'The build provider will be available in your project, even when not eligible',
    type: 'boolean',
    default: true,
    order: 4
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

    getFiles(outDirName, filter) {
      return Array.prototype.map.call(atom.project.getDirectories()[0].getSubdirectory(outDirName).getEntriesSync(),
                                              function(item) { return item.getPath(); }).filter(function(fileName) {
                                                  return fileName.endsWith(filter);
                                                });
    }

    getConfig() {

      if(!existsSync(this.file)) {
        this.file = undefined;
        return undefined;
      }

      let fileContents = fs.readFileSync(this.file, 'utf8');
      return yaml.load(fileContents);
    }

    settings() {


      let OUT_DIR = 'out';
      let SRC_DIR = 'src';
      // let fileContents = fs.readFileSync(this.file, 'utf8');
      let yamlConfig = instance.getConfig();
      let UNITVM_KIT_HOME = atom.config.get('build-unitvm.unitvmKitHomeDir'); //'/Users/lashadolidze/MyProjects/Darjeeling-VM/UnitVM/unitkit32';
      let bootclasspath = path.join(UNITVM_KIT_HOME, 'ulib/core32-0.0.1.jar');
      let unitvmc = path.join(UNITVM_KIT_HOME, 'bin/uvmc.sh');
      let uvmcArgs = ['-verbose', `-d=${OUT_DIR}`];
      let classes = instance.getFiles(`${OUT_DIR}`, '.class').join(' ');

      /* Update settings when config file changes */
      if(this.file !== undefined) {
        const refresh = new Date();
        this.fileWatcher = watch(this.file, () => {
          if (new Date() - refresh > 3000) {
            this.emit('refresh');
          }
        });
      }
      /* ------------------------- */

      pre = function() {
        let classes = instance.getFiles(`${OUT_DIR}`, '.class');
        if(!classes.length) {
            atom.notifications.addWarning('First compile java target in order to generate .class files');
            return false;
        }

        return true;
      }

      post = function(success) {
          instance.emit('refresh');
          if(success) {
            atom.notifications.addSuccess("UnitVM build successful");
          }
          else {
            atom.notifications.addError("UnitVM build failed");
          }
      };

      if(yamlConfig !== undefined) {
        if(yamlConfig.eui64) {
          uvmcArgs.push(`-e=${yamlConfig.eui64}`);
        }

        if(yamlConfig.name) {
          uvmcArgs.push(`-n=${yamlConfig.name}`);
        }
      }

      uvmcArgs.push(`${bootclasspath}`);
      uvmcArgs.push(`${classes}`);

      let args = ['-verbose',
                  `-d ${OUT_DIR}`,
                  '--source=8',
                  '--target=8',
                  `-bootclasspath ${bootclasspath}`];

      let paths = instance.getFiles(`${SRC_DIR}`, '.java').join(' ');
      args = args.concat(paths);

      const defaultTarget = {
        postBuild: post,
        exec: 'javac',
        name: 'UnitVM Build: Compile Java',
        args: args,
        sh: true,
        errorMatch: errorMatch,
        // warningMatch: warningMatch
      };

      const uvmcTarget = {
        preBuild: pre,
        postBuild: post,
        exec: `${unitvmc}`,
        name: 'UnitVM Build: Translate Java Bytecode',
        args: uvmcArgs,
        sh: true
      };

      const cleanBuildTarget = {
        postBuild: post,
        exec: `rm`,
        name: 'UnitVM Build: Clean',
        args: [`${OUT_DIR}/*`],
        sh: true
      };

      return [defaultTarget, uvmcTarget, cleanBuildTarget];

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
