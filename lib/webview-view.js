'use babel';

import Url from "./url";

export default class WebviewView {

  constructor(url) {
    // Create root element
    this.element = document.createElement('div');
    this.element.classList.add('webview');

    const urlparser = new Url();

    const main = document.createElement("div");
    const menu = document.createElement("div");
    const protocol = document.createElement("div");
    const input = document.createElement("input");
    const button = document.createElement("button");
    const webview = document.createElement("webview");

    const backButton = document.createElement("button");
    const nextButton = document.createElement("button");

    main.classList.add("wv-main", "native-key-bindings");
    menu.classList.add("wv-menu", "naive-key-bindings");
    backButton.classList.add("wv-nav-button", "icon-chevron-left", "backIcon", "native-key-bindings");
    nextButton.classList.add("wv-nav-button", "icon-chevron-right", "nextIcon", "native-key-bindings");
    protocol.classList.add("wv-protocol", "icon-lock", "native-key-bindings")
    input.classList.add("wv-input", "native-key-bindings");
    button.classList.add("wv-button", "native-key-bindings");
    webview.classList.add("wv-webview", "native-key-bindings");

    button.innerHTML = "Search";
    input.placeholder = "url or search google";

    backButton.disabled = true;
    nextButton.disabled = true;

    const loadUrlIntoWebview = (url) => {
        const parsed = urlparser.parse(url);
        protocol.title = parsed.protocol;
        webview.loadURL(parsed.url);
    }

    const updateInputValue = (value) => {
        input.value = urlparser.removeProtocol(value);
    }

    const setCanGoBack = () => {
      if (webview.canGoBack()) {
        backButton.removeAttribute("disabled");
      } else {
        backButton.setAttribute("disabled", true);
      }
    }
    const setCanGoForward = () => {
      if (webview.canGoForward()) {
        nextButton.removeAttribute("disabled");
      } else {
        nextButton.setAttribute("disabled", true);
      }
    }

    const setTitle = (title) => {
      this.title = title;
    }

    input.addEventListener("keypress", (evt) => {
        if (evt.charCode == 13) {
            loadUrlIntoWebview(input.value);
        }
    });

    button.addEventListener("click", () => {
        loadUrlIntoWebview(input.value);
    });

    webview.addEventListener("did-navigate", (evt) => {
        updateInputValue(evt.url);
        setCanGoBack();
        setCanGoForward();
    });

    webview.addEventListener("did-navigate-in-page", (evt) => {
        updateInputValue(evt.url);
        setCanGoBack();
        setCanGoForward();
    });

    webview.addEventListener('new-window', (evt) => {
        updateInputValue(evt.url);
    });

    webview.addEventListener('dom-ready', () => {
      webview.executeJavaScript(`
        Array.prototype.slice.call(document.querySelectorAll("a"))
        .filter(a => a.target="_blank")
        .forEach(a => a.target="_self")
      `);
    })

    backButton.addEventListener("click", () => {
      webview.goBack();
    });

    nextButton.addEventListener("click", () => {
      webview.goForward();
    });

    menu.appendChild(backButton);
    menu.appendChild(nextButton);
    menu.appendChild(protocol);
    menu.appendChild(input);
    menu.appendChild(button);
    main.appendChild(menu);
    main.appendChild(webview);

    this.element.appendChild(main);

    loadUrlIntoWebview(url);
  }

  // Returns an object that can be retrieved when package is activated
  serialize() {}

  // Tear down any state and detach
  destroy() {
    this.element.remove();
  }

  getElement() {
    return this.element;
  }

  getTitle() {
      return "Webview";
  }

}
