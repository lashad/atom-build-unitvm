'use babel';

import os from 'os';
const path = require('path')

export default {
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
        default: `src${path.sep}main${path.sep}java`,
        order: 3
    },
    defaultMcuName: {
        title: 'Default MCU Name',
        description: 'Default MCU name will be used in new config file while creating',
        type: 'string',
        default: 'atmega328p',
        enum: [
            { value: 'atmega328p', description: 'ATmega328P MCU' },
            { value: 'atmega644p', description: 'ATmega644P MCU' }
        ],
        radio: false,
        order: 4
    },
    defaultBps: {
        title: 'Default Serial Port Speed',
        description: 'Default BPS will be used when programming MCU',
        type: 'integer',
        default: 115200,
        enum: [9600, 14400, 19200, 28800, 38400, 57600, 115200, 230400],
        radio: true,
        order: 5
    },
    jobs: {
        title: 'Simultaneous jobs',
        description: 'Limits how many jobs make will run simultaneously. Defaults to number of processors. Set to 1 for default behavior of make',
        type: 'number',
        default: os.cpus().length,
        minimum: 1,
        maximum: os.cpus().length,
        order: 6
    },
    manageDependencies: {
        title: 'Manage Dependencies',
        description: 'When enabled, third-party dependencies will be installed automatically',
        type: 'boolean',
        default: true,
        order: 7
    },
    alwaysEligible: {
        title: 'Always Eligible',
        description: 'The build provider will be available in your project, even when not eligible',
        type: 'boolean',
        default: false,
        order: 8
    }
};
