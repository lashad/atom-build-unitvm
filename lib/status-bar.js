"use babel";

var https = require('follow-redirects').https;
const fs = require('fs');
const extract = require('extract-zip');

export class StatusBarItem {
  constructor() {
    this.element = document.createElement("div");
    this.element.className = "inline-block text-success";
    this.setPort(null);
  }

  setToopTip(title) {
    let tooltip = atom.tooltips.findTooltips(this.element);
    if(tooltip.length) {
      tooltip[0].options.title = title;
    } else {
      atom.tooltips.add(this.element, {title: title});
    }
  }

  download(des, src, dir) {
    return new Promise(function(resolve, reject) {
      const file = fs.createWriteStream(des);
      const request = https.get(src, function(res) {
        const { statusCode } = res;
        const contentType = res.headers['content-type'];
        let error;
        if (statusCode !== 200) {
          reject();
        } else {
          res.pipe(file);
          res.on('end', () => {
              extract(des, { dir: dir }).then(() => {
                resolve();
              }).catch(() => {
                reject();
              }).finally(() => {
                fs.unlink(des, (err) => {
                  if(err) {
                    reject();
                  }
                });
              });
          });
        }
      });
    });
  }

  setPort(port) {
    if (port) {
      this.element.innerHTML = `<span class="icon icon-dashboard"></span> ${port}`;
      // this.element.classList.add("text-success");
    } else {
      // this.element.classList.remove("text-success");
      this.element.innerHTML = `<span class="icon icon-dashboard"></span> Build & Upload`;
      // this.element.innerHTML = `<label>32%</label> | <progress value="50" max="100"></progress>`;
    }
  }

  setInfo(text) {
    if (text) {
      this.element.innerHTML = `<span class="icon icon-download"></span>${text}`;
    }
  }

  onClick(callback) {
    this.element.addEventListener("click", callback);
  }

  onRightClick(callback) {
    this.element.addEventListener("contextmenu", callback);
  }
}

export const createStatusBarItem = () => new StatusBarItem();
