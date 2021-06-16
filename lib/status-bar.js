"use babel";

export class StatusBarItem {
  constructor() {
    this.element = document.createElement("div");
    // atom.tooltips.add(this.element, {title: 'This is a tooltip'});
    this.element.className = "inline-block";
    this.setPort(null);
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
