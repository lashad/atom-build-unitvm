"use babel";

const { exec } = require("child_process");
import { getCliCommand } from "./utils";

const unitvmCli = (command, args, cb) =>
    new Promise((resolve, reject) => {
        exec(`${getCliCommand(command)} ${args}`, (err, stdout, stderr) => {
            if (err) {
                reject(stderr);
            } else {
                resolve(stdout);
            }
        });
    });

export const listFirmwares = (args) => {
    
    if (/^win/.test(process.platform)) {
        return unitvmCli('dir', args);
    }

    return unitvmCli('ls', args);
}

export const listPorts = (args) =>
    unitvmCli('uvmports', args);

export const decompile = (args) =>
    unitvmCli('uvmp', args);

export const upload = (mcu, port, bps, file) =>
    unitvmCli('avrdude', `-c arduino -p ${mcu} -b ${bps} -P ${port} -U flash:w:"${file}":i`);
