// Copyright 2024, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import {
    atoms,
    createBlock,
    createTab,
    getApi,
    getBlockComponentModel,
    globalStore,
    refocusNode,
    WOS,
} from "@/app/store/global";
import {
    deleteLayoutModelForTab,
    getLayoutModelForTab,
    getLayoutModelForTabById,
    NavigateDirection,
} from "@/layout/index";
import { getLayoutModelForStaticTab } from "@/layout/lib/layoutModelHooks";
import * as keyutil from "@/util/keyutil";
import * as jotai from "jotai";

const simpleControlShiftAtom = jotai.atom(false);
const globalKeyMap = new Map<string, (waveEvent: WaveKeyboardEvent) => boolean>();

function getFocusedBlockInStaticTab() {
    const tabId = globalStore.get(atoms.staticTabId);
    const layoutModel = getLayoutModelForTabById(tabId);
    const focusedNode = globalStore.get(layoutModel.focusedNode);
    return focusedNode.data?.blockId;
}

function getSimpleControlShiftAtom() {
    return simpleControlShiftAtom;
}

function setControlShift() {
    globalStore.set(simpleControlShiftAtom, true);
    setTimeout(() => {
        const simpleState = globalStore.get(simpleControlShiftAtom);
        if (simpleState) {
            globalStore.set(atoms.controlShiftDelayAtom, true);
        }
    }, 400);
}

function unsetControlShift() {
    globalStore.set(simpleControlShiftAtom, false);
    globalStore.set(atoms.controlShiftDelayAtom, false);
}

function shouldDispatchToBlock(e: WaveKeyboardEvent): boolean {
    if (globalStore.get(atoms.modalOpen)) {
        return false;
    }
    const activeElem = document.activeElement;
    if (activeElem != null && activeElem instanceof HTMLElement) {
        if (activeElem.tagName == "INPUT" || activeElem.tagName == "TEXTAREA" || activeElem.contentEditable == "true") {
            if (activeElem.classList.contains("dummy-focus")) {
                return true;
            }
            if (keyutil.isInputEvent(e)) {
                return false;
            }
            return true;
        }
    }
    return true;
}

function genericClose(tabId: string) {
    const tabORef = WOS.makeORef("tab", tabId);
    const tabAtom = WOS.getWaveObjectAtom<Tab>(tabORef);
    const tabData = globalStore.get(tabAtom);
    if (tabData == null) {
        return;
    }
    if (tabData.blockids == null || tabData.blockids.length == 0) {
        // close tab
        getApi().closeTab(tabId);
        deleteLayoutModelForTab(tabId);
        return;
    }
    const layoutModel = getLayoutModelForTab(tabAtom);
    layoutModel.closeFocusedNode();
}

function switchBlockByBlockNum(index: number) {
    const layoutModel = getLayoutModelForStaticTab();
    if (!layoutModel) {
        return;
    }
    layoutModel.switchNodeFocusByBlockNum(index);
}

function switchBlockInDirection(tabId: string, direction: NavigateDirection) {
    const layoutModel = getLayoutModelForTabById(tabId);
    layoutModel.switchNodeFocusInDirection(direction);
}

function switchTabAbs(index: number) {
    console.log("switchTabAbs", index);
    const ws = globalStore.get(atoms.workspace);
    const waveWindow = globalStore.get(atoms.waveWindow);
    const newTabIdx = index - 1;
    if (newTabIdx < 0 || newTabIdx >= ws.tabids.length) {
        return;
    }
    const newActiveTabId = ws.tabids[newTabIdx];
    getApi().setActiveTab(newActiveTabId);
}

function switchTab(offset: number) {
    console.log("switchTab", offset);
    const ws = globalStore.get(atoms.workspace);
    const curTabId = globalStore.get(atoms.staticTabId);
    let tabIdx = -1;
    for (let i = 0; i < ws.tabids.length; i++) {
        if (ws.tabids[i] == curTabId) {
            tabIdx = i;
            break;
        }
    }
    if (tabIdx == -1) {
        return;
    }
    const newTabIdx = (tabIdx + offset + ws.tabids.length) % ws.tabids.length;
    const newActiveTabId = ws.tabids[newTabIdx];
    getApi().setActiveTab(newActiveTabId);
}

function handleCmdI() {
    const layoutModel = getLayoutModelForStaticTab();
    const focusedNode = globalStore.get(layoutModel.focusedNode);
    if (focusedNode == null) {
        // focus a node
        layoutModel.focusFirstNode();
        return;
    }
    const blockId = focusedNode?.data?.blockId;
    if (blockId == null) {
        return;
    }
    refocusNode(blockId);
}

async function handleCmdN() {
    const termBlockDef: BlockDef = {
        meta: {
            view: "term",
            controller: "shell",
        },
    };
    const layoutModel = getLayoutModelForStaticTab();
    const focusedNode = globalStore.get(layoutModel.focusedNode);
    if (focusedNode != null) {
        const blockAtom = WOS.getWaveObjectAtom<Block>(WOS.makeORef("block", focusedNode.data?.blockId));
        const blockData = globalStore.get(blockAtom);
        if (blockData?.meta?.view == "term") {
            if (blockData?.meta?.["cmd:cwd"] != null) {
                termBlockDef.meta["cmd:cwd"] = blockData.meta["cmd:cwd"];
            }
        }
        if (blockData?.meta?.connection != null) {
            termBlockDef.meta.connection = blockData.meta.connection;
        }
    }
    await createBlock(termBlockDef);
}

function appHandleKeyDown(waveEvent: WaveKeyboardEvent): boolean {
    const handled = handleGlobalWaveKeyboardEvents(waveEvent);
    if (handled) {
        return true;
    }
    const layoutModel = getLayoutModelForStaticTab();
    const focusedNode = globalStore.get(layoutModel.focusedNode);
    const blockId = focusedNode?.data?.blockId;
    if (blockId != null && shouldDispatchToBlock(waveEvent)) {
        const bcm = getBlockComponentModel(blockId);
        const viewModel = bcm?.viewModel;
        if (viewModel?.keyDownHandler) {
            const handledByBlock = viewModel.keyDownHandler(waveEvent);
            if (handledByBlock) {
                return true;
            }
        }
    }
    return false;
}

function registerControlShiftStateUpdateHandler() {
    getApi().onControlShiftStateUpdate((state: boolean) => {
        if (state) {
            setControlShift();
        } else {
            unsetControlShift();
        }
    });
}

function registerElectronReinjectKeyHandler() {
    getApi().onReinjectKey((event: WaveKeyboardEvent) => {
        appHandleKeyDown(event);
    });
}

function tryReinjectKey(event: WaveKeyboardEvent): boolean {
    return appHandleKeyDown(event);
}

function registerGlobalKeys() {
    globalKeyMap.set("Cmd:]", () => {
        switchTab(1);
        return true;
    });
    globalKeyMap.set("Shift:Cmd:]", () => {
        switchTab(1);
        return true;
    });
    globalKeyMap.set("Cmd:[", () => {
        switchTab(-1);
        return true;
    });
    globalKeyMap.set("Shift:Cmd:[", () => {
        switchTab(-1);
        return true;
    });
    globalKeyMap.set("Cmd:n", () => {
        handleCmdN();
        return true;
    });
    globalKeyMap.set("Cmd:i", () => {
        handleCmdI();
        return true;
    });
    globalKeyMap.set("Cmd:t", () => {
        createTab();
        return true;
    });
    globalKeyMap.set("Cmd:w", () => {
        const tabId = globalStore.get(atoms.staticTabId);
        genericClose(tabId);
        return true;
    });
    globalKeyMap.set("Cmd:m", () => {
        const layoutModel = getLayoutModelForStaticTab();
        const focusedNode = globalStore.get(layoutModel.focusedNode);
        if (focusedNode != null) {
            layoutModel.magnifyNodeToggle(focusedNode.id);
        }
        return true;
    });
    globalKeyMap.set("Ctrl:Shift:ArrowUp", () => {
        const tabId = globalStore.get(atoms.staticTabId);
        switchBlockInDirection(tabId, NavigateDirection.Up);
        return true;
    });
    globalKeyMap.set("Ctrl:Shift:ArrowDown", () => {
        const tabId = globalStore.get(atoms.staticTabId);
        switchBlockInDirection(tabId, NavigateDirection.Down);
        return true;
    });
    globalKeyMap.set("Ctrl:Shift:ArrowLeft", () => {
        const tabId = globalStore.get(atoms.staticTabId);
        switchBlockInDirection(tabId, NavigateDirection.Left);
        return true;
    });
    globalKeyMap.set("Ctrl:Shift:ArrowRight", () => {
        const tabId = globalStore.get(atoms.staticTabId);
        switchBlockInDirection(tabId, NavigateDirection.Right);
        return true;
    });
    globalKeyMap.set("Cmd:g", () => {
        const bcm = getBlockComponentModel(getFocusedBlockInStaticTab());
        if (bcm.openSwitchConnection != null) {
            bcm.openSwitchConnection();
            return true;
        }
    });
    for (let idx = 1; idx <= 9; idx++) {
        globalKeyMap.set(`Cmd:${idx}`, () => {
            switchTabAbs(idx);
            return true;
        });
        globalKeyMap.set(`Ctrl:Shift:c{Digit${idx}}`, () => {
            switchBlockByBlockNum(idx);
            return true;
        });
        globalKeyMap.set(`Ctrl:Shift:c{Numpad${idx}}`, () => {
            switchBlockByBlockNum(idx);
            return true;
        });
    }
    const allKeys = Array.from(globalKeyMap.keys());
    // special case keys, handled by web view
    allKeys.push("Cmd:l", "Cmd:r", "Cmd:ArrowRight", "Cmd:ArrowLeft");
    getApi().registerGlobalWebviewKeys(allKeys);
}

function getAllGlobalKeyBindings(): string[] {
    const allKeys = Array.from(globalKeyMap.keys());
    return allKeys;
}

// these keyboard events happen *anywhere*, even if you have focus in an input or somewhere else.
function handleGlobalWaveKeyboardEvents(waveEvent: WaveKeyboardEvent): boolean {
    for (const key of globalKeyMap.keys()) {
        if (keyutil.checkKeyPressed(waveEvent, key)) {
            const handler = globalKeyMap.get(key);
            if (handler == null) {
                return false;
            }
            return handler(waveEvent);
        }
    }
}

export {
    appHandleKeyDown,
    getAllGlobalKeyBindings,
    getSimpleControlShiftAtom,
    registerControlShiftStateUpdateHandler,
    registerElectronReinjectKeyHandler,
    registerGlobalKeys,
    tryReinjectKey,
    unsetControlShift,
};
