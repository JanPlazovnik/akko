import { BrowserWindow } from "electron";

interface AppContext {
    window: BrowserWindow;
}


let ctx: AppContext | null = null;

export function initContext(data: AppContext) {
    ctx = data;
}

export function getContext(): AppContext {
    if (!ctx) {
        throw new Error("Context not initialized");
    }

    return ctx;
}

export function getWindow(): BrowserWindow {
    return getContext().window;
}

export function sendToRenderer(channel: string, ...args: any[]) {
    getWindow().webContents.send(channel, ...args);
}