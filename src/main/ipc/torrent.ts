import { ipcMain } from 'electron';
import type { EpisodeNumbers } from '../../shared/anizip/types';
import { checkNetwork, startTorrent, stopTorrent } from '../torrent/torrent';

export function registerTorrentHandlers() {
    ipcMain.handle('stream:start', async (_event, magnet: string, episode?: EpisodeNumbers) =>
        startTorrent(magnet, episode)
    );

    ipcMain.handle('stream:stop', async (_event, torrentId: string | null) => {
        await stopTorrent(torrentId);
    });

    ipcMain.handle('stream:check-network', () => checkNetwork());
}
