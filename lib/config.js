'use babel';

import os from 'os';

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
