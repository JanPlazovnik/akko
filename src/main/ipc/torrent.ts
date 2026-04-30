import { ipcMain } from 'electron';
import { startTorrent, stopTorrent } from '../torrent/torrent';

export function registerTorrentHandlers() {
    ipcMain.handle('stream:start', async (event, magnet: string) => {
        console.log('[DEBUG] IPC stream:start received, magnet:', magnet);
        const result = await startTorrent(magnet);
        console.log('[DEBUG] IPC stream:start done, torrentId:', result.torrentId);
        return result;
    });

    ipcMain.handle('stream:stop', async (event, torrentId: string) => {
        console.log('[DEBUG] IPC stream:stop received, torrentId:', torrentId);
        await stopTorrent(torrentId);
        console.log('[DEBUG] IPC stream:stop done');
    });
}
