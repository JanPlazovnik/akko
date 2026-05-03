import { ipcMain } from 'electron';
import { startTorrent, stopTorrent } from '../torrent/torrent';

export function registerTorrentHandlers() {
    ipcMain.handle('stream:start', async (_event, magnet: string) => {
        return startTorrent(magnet);
    });

    ipcMain.handle('stream:stop', async (_event, torrentId: string) => {
        await stopTorrent(torrentId);
    });
}
