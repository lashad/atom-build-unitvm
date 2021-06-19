'use babel';

import { SelectListView } from 'atom-space-pen-views';
import { getYamlConfig } from "./utils";

export class ListView extends SelectListView {

    constructor() {
        super(...arguments);
    }

    initialize() {
        super.initialize(...arguments);
        this.addClass('build-target');
        this.list.addClass('mark-active');
    }

    show() {
        this.panel = atom.workspace.addModalPanel({ item: this });
        this.panel.show();
        this.focusFilterEditor();
    }

    hide() {
        this.panel.hide();
    }

    setItems() {
        super.setItems(...arguments);

        const activeItemView = this.find('.active');
        if (0 < activeItemView.length) {
            this.selectItemView(activeItemView);
            this.scrollToItemView(activeItemView);
        }
    }

    setActiveTarget(target) {
        this.activeTarget = target;
    }

    viewForItem(targetName) {
        const activeTarget = this.activeTarget;
        return ListView.render(function () {
            const activeClass = (targetName === activeTarget ? 'active' : '');
            this.li({ class: activeClass + ' build-target' }, targetName);
        });
    }

    getEmptyMessage(itemCount) {

        if (0 === itemCount && this.emptyMessage !== undefined) {
            return this.emptyMessage;
        }

        return this.emptyMessage;
    }

    setEmptyMessage(message) {
        this.emptyMessage = message;
    }

    awaitSelection() {
        return new Promise((resolve, reject) => {
            this.resolveFunction = resolve;
        });
    }

    confirmed(target) {
        if (this.resolveFunction) {
            this.resolveFunction(target);
            this.resolveFunction = null;
        }
        this.hide();
    }

    cancelled() {
        this.hide();
    }
}

export const createListView = (list, selected, empryMessage) => {

    let listView = new ListView();

    listView.setEmptyMessage(empryMessage);
    listView.setActiveTarget(selected);
    listView.setItems(list);
    listView.show();

    return listView;
}
