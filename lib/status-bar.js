"use babel";

var https = require('follow-redirects').https;
const fs = require('fs');
const extract = require('extract-zip');

export class StatusBarItem {
  constructor() {
    this.element = document.createElement("div");
    this.element.className = "inline-block";
    this.setInfo(null);
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

  setText(text, className) {
    this.element.classList.remove("text-success");
    this.element.classList.remove("text-warning");
    this.element.classList.remove("text-error");

    if (text) {
      this.element.classList.add(className);
      this.element.innerHTML = `<span class="icon icon-download"></span>${text}`;
    }else {
      this.element.classList.add(className);
      this.element.innerHTML = `<span class="icon icon-dashboard"></span> UnitVM`;
      // this.element.innerHTML = `<label>32%</label> | <progress value="50" max="100"></progress>`;
    }
  }

  setInfo(text) {
    this.setText(text, null);
  }

  setSuccess(text) {
    this.setText(text, "text-success");
  }

  setWarning(text) {
    this.setText(text, "text-warning");
  }

  onClick(callback) {
    this.element.addEventListener("click", callback);
  }

  onRightClick(callback) {
    this.element.addEventListener("contextmenu", callback);
  }
}

export const createStatusBarItem = () => new StatusBarItem();
