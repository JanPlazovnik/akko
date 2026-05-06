import { BrowserWindow } from 'electron';
import type { RendererEventMap } from '../shared/ipc/api';

export interface AppContext {
    window: BrowserWindow;
    services: AppServices;
}

export interface AppServices {
    renderer: RendererBridge;
}

export interface RendererBridge {
    send<K extends keyof RendererEventMap>(channel: K, ...args: RendererEventMap[K]): void;
}

let ctx: AppContext | null = null;

export function initContext(data: { window: BrowserWindow; services?: Partial<AppServices> }) {
    ctx = {
        window: data.window,
        services: {
            renderer: data.services?.renderer ?? createRendererBridge(data.window),
        },
    };
}

export function getContext(): AppContext {
    if (!ctx) {
        throw new Error('Context not initialized');
    }

    return ctx;
}

export function getWindow(): BrowserWindow {
    return getContext().window;
}

export function getServices(): AppServices {
    return getContext().services;
}

export function sendToRenderer<K extends keyof RendererEventMap>(
    channel: K,
    ...args: RendererEventMap[K]
) {
    getServices().renderer.send(channel, ...args);
}

function createRendererBridge(window: BrowserWindow): RendererBridge {
    return {
        send(channel, ...args) {
            window.webContents.send(channel, ...args);
        },
    };
}
