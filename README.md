# UnitVM Application Build for Atom (via atom-build)

Uses the [atom-build](https://github.com/noseglid/atom-build) package to execute UnitVM build processes in the `Atom` text editor.

This package requires [atom-build](https://github.com/noseglid/atom-build) to be installed.



#### Requirements

You'll need to install java `OpenJDK` and `avrdude` to build and upload UnitVM application. The `avrdude` is needed to upload application in your Arduino or ATmega328p compatable board. if you have Arduino IDE installed, then most likely `avrdude` is already installed on your computer.



#### Manual Installation

Right now package is not published in Atom public registry. So,  you need to install manually from GitHub.

Run terminal window and execute the following commands below:

	$ git clone https://github.com/lashad/atom-build-unitvm.git
	$ cd atom-build-unitvm
	$ apm install
	$ apm link

> Note:
>
> - You may [download zip](https://github.com/lashad/atom-build-unitvm/archive/refs/heads/master.zip) file and extract in your computer in case if you don't have `git` tool installed.
>
> - Atom packages are located in `~/.atom/packages` directory.

Now run Atom Text Editor.



#### Create UnitVM Project

Under the `File` menu choose `New UnitVM Project` . In the dialog prompt window create the new directory named `HelloWorld` or whatever you want. Click `Choose` button. The package will create a template project with all the necessary files in it.

Now open `HelloWorld.java` file from left tree view. 

![create-project](create-project.gif)



Click on `UnitVM` button located at the bottom of the status bar. First time the package ask you to download UnitKit Framework in your computer. Click `Download` then Click `F7` and choose `UnitVM: Build Application` to build your first UnitVM application.

![download-install-unitkit](download-install-unitkit.gif)



#### Config File

In your project directory you will find file `.unitvm-build.yml` the content may look like:

    name: HelloWorld
    eui64: E3:D1:96:5B:3B:74:CC:B7
    avrdude:
      mcu: atmega328p
      bps: 57600
      port: /dev/cu.usbserial-A6007Whc

Where `name` is your application name and `eui64` is unique identifier of your uvm binary file. The next is the `avrdude` configuration parameters in your build file.

##### Configuration Parameters Description 

| Name       | Description                          |
| ---------- | ------------------------------------ |
| `name`     | UnitVM application name              |
| `eui64`    | UnitVM binary file unique identifier |
| `avrdude:` | `avrdude` configuraton group         |
| `mcu`      | Microcontroller name                 |
| `bps`      | Serial port speed (bit per second)   |
| `port`     | Serial port name                     |

>  Make sure to change `port` parameter to match your systems serial port name.

