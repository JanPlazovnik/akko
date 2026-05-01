import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
    startStream: (magnet: string) => ipcRenderer.invoke('stream:start', magnet),
    stopStream: (torrentId: string) => ipcRenderer.invoke('stream:stop', torrentId),
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    maximizeWindow: () => ipcRenderer.send('window:maximize'),
    closeWindow: () => ipcRenderer.send('window:close'),
});
