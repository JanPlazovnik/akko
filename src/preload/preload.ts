import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ExtensionManifest, SearchMethod, SearchParams } from '../main/extensions/types';
import type { AppApi, RendererEventMap } from '../shared/ipc/api';
import type { EpisodeNumbers } from '../shared/anizip/types';

const api: AppApi = {
    startStream: (magnet: string, episode?: EpisodeNumbers) =>
        ipcRenderer.invoke('stream:start', magnet, episode),
    stopStream: (torrentId: string | null) => ipcRenderer.invoke('stream:stop', torrentId),
    checkNetwork: () => ipcRenderer.invoke('stream:check-network'),
    on: (channel, listener) => {
        const handler = (_event: IpcRendererEvent, ...args: RendererEventMap[typeof channel]) =>
            listener(...args);
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
    },
    metadata: {
        anilist: (query, variables, maxAge) =>
            ipcRenderer.invoke('anilist:query', query, variables, maxAge),
        anilistUser: (query, variables, maxAge) =>
            ipcRenderer.invoke('anilist:user-query', query, variables, maxAge),
        anilistMutate: (query, variables) => ipcRenderer.invoke('anilist:mutate', query, variables),
        anilistOutage: () => ipcRenderer.invoke('anilist:outage'),
        anizipEpisodes: (anilistId, maxAge) =>
            ipcRenderer.invoke('anizip:episodes', anilistId, maxAge),
        art: (anilistId) => ipcRenderer.invoke('metadata:art', anilistId),
        skipTimes: (anilistId, episode, duration) =>
            ipcRenderer.invoke('metadata:skip-times', anilistId, episode, duration),
        cacheCount: () => ipcRenderer.invoke('cache:count'),
        clearCache: () => ipcRenderer.invoke('cache:clear'),
    },
    accounts: {
        get: () => ipcRenderer.invoke('accounts:get'),
        loginAnilist: () => ipcRenderer.invoke('accounts:anilist-login'),
        logoutAnilist: () => ipcRenderer.invoke('accounts:anilist-logout'),
    },
    settings: {
        get: () => ipcRenderer.invoke('settings:get'),
        update: (patch) => ipcRenderer.invoke('settings:update', patch),
        paths: () => ipcRenderer.invoke('settings:paths'),
        chooseFolder: (current) => ipcRenderer.invoke('settings:choose-folder', current),
        checkFolder: (folder) => ipcRenderer.invoke('settings:check-folder', folder),
        openDownloads: () => ipcRenderer.invoke('settings:open-downloads'),
        openLogs: () => ipcRenderer.invoke('settings:open-logs'),
    },
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),
    cursorPosition: () => ipcRenderer.invoke('window:cursor'),
    appInfo: () => ipcRenderer.invoke('app:info'),
    progress: {
        all: () => ipcRenderer.invoke('progress:all'),
        // Fire and forget, so the last save still goes out while the window is closing
        save: (progress) => ipcRenderer.send('progress:save', progress),
    },
    setPresence: (state) => ipcRenderer.send('presence:set', state),

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
