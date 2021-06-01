# UnitVM Application Build for Atom (via atom-build)

Uses the [atom-build](https://github.com/noseglid/atom-build) package to execute
UnitVM build processes in the `Atom` editor.

This package requires [atom-build](https://github.com/noseglid/atom-build) to be installed.

#### Config File

In your project directory create file `.unitvm-build.yml` and add content below:

    name: AppName
    eui64: 2C:1C:F6:D9:00:00:00:00

Where `name` is your application name and `eui64` is unique identifier of your application. 
Please note: All your `.java` source files should be located under `src` directory,

You may want to upload on your device using `avrdude` . Now you can add `avrdude` configuration parameters in your build file:

    name: AppName
    eui64: 2C:1C:F6:D9:00:00:00:00
    avrdude:
      mcu: atmega328p
      bps: 57600
      port: /dev/cu.usbserial-A6007Whc

Make sure to change `port` parameter to match your system USB serial port name.

