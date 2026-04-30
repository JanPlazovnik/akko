import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startStream: (magnet: string) => ipcRenderer.invoke('stream:start', magnet),
    stopStream: (torrentId: string) => ipcRenderer.invoke('stream:stop', torrentId),
});
