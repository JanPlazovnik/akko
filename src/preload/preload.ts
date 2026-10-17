import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ExtensionManifest, SearchMethod, SearchParams } from '../main/extensions/types';
import type { AppApi, RendererEventMap } from '../shared/ipc/api';

const api: AppApi = {
    startStream: (magnet: string, episode?: number) =>
        ipcRenderer.invoke('stream:start', magnet, episode),
    stopStream: (torrentId: string | null) => ipcRenderer.invoke('stream:stop', torrentId),
    on: (channel, listener) => {
        const handler = (_event: IpcRendererEvent, ...args: RendererEventMap[typeof channel]) =>
            listener(...args);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),

    extensions: {
        list: () => ipcRenderer.invoke('extension:list'),
        fetchRepository: (url: string) => ipcRenderer.invoke('extension:fetch-repository', url),
        install: (manifest: ExtensionManifest) => ipcRenderer.invoke('extension:install', manifest),
        uninstall: (id: string) => ipcRenderer.invoke('extension:uninstall', id),
        toggle: (id: string, enabled: boolean) =>
            ipcRenderer.invoke('extension:toggle', id, enabled),
        checkUpdates: () => ipcRenderer.invoke('extension:check-updates'),
        test: (id: string) => ipcRenderer.invoke('extension:test', id),
        update: (id: string, newVersion: string, codeUrl: string) =>
            ipcRenderer.invoke('extension:update', id, newVersion, codeUrl),
        search: (id: string, method: SearchMethod, params: SearchParams) =>
            ipcRenderer.invoke('extension:search', id, method, params),
        searchAll: (method: SearchMethod, params: SearchParams) =>
            ipcRenderer.invoke('extension:search-all', method, params),
    },
};

contextBridge.exposeInMainWorld('api', api);
