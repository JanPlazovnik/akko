import { contextBridge, ipcRenderer } from 'electron';
import type { ExtensionManifest, SearchMethod, SearchParams } from '../main/extensions/types';

contextBridge.exposeInMainWorld('api', {
    startStream: (magnet: string) => ipcRenderer.invoke('stream:start', magnet),
    stopStream: (torrentId: string) => ipcRenderer.invoke('stream:stop', torrentId),
    onSubtitle: (
        cb: (
            sub: {
                text: string;
                time: number;
                duration: number;
                readOrder?: string;
                layer?: string;
                style?: string;
                name?: string;
                marginL?: string;
                marginR?: string;
                marginV?: string;
                effect?: string;
            },
            trackNumber: string
        ) => void
    ) => {
        ipcRenderer.removeAllListeners('stream:subtitle');
        ipcRenderer.on('stream:subtitle', (_event, sub, trackNumber) => cb(sub, trackNumber));
    },
    offSubtitle: () => ipcRenderer.removeAllListeners('stream:subtitle'),
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
});
