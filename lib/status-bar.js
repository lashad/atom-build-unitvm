"use babel";

export class StatusBarItem {
  constructor() {
    this.element = document.createElement("div");
    this.element.className = "inline-block";
    this.setPort(null);
  }

  setToopTip(title) {
      let tooltip = atom.tooltips.findTooltips(this.element);
      if(tooltip.length) {
        console.log(tooltip);
        tooltip[0].options.title = title;
      } else {
        atom.tooltips.add(this.element, {title: title});
      }
  }

  setPort(port) {
    if (port) {
      this.element.innerHTML = `<span class="icon icon-dashboard"></span> ${port}`;
      this.element.classList.add("text-success");
    } else {
      this.element.classList.remove("text-success");
      this.element.innerHTML = `<span class="icon icon-dashboard"></span> Build & Upload`;
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
