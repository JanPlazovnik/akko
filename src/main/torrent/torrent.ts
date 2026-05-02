import { Torrent, WebTorrentOptions } from 'webtorrent';
import http from 'http';
import { createStreamServer } from './stream';

let client: any = null;
let activeServer: http.Server | null = null;

export async function initClient(opts?: WebTorrentOptions) {
    console.log('[DEBUG] Initializing WebTorrent client');
    const WebTorrent = (await import('webtorrent')).default;
    client = new WebTorrent(opts);
    console.log('[DEBUG] WebTorrent client ready');
}

function getClient() {
    if (!client) throw new Error('Torrent client not initialized');
    return client;
}

function closeActiveServer() {
    if (activeServer) {
        console.log('[DEBUG] Closing active stream server');
        activeServer.close();
        activeServer = null;
    }
}

export async function startTorrent(
    magnetUri: string
): Promise<{ torrentId: string; streamUrl: string; mimeType: string }> {
    console.log('[DEBUG] startTorrent called:', magnetUri);

    closeActiveServer();

    const existing = client?.torrents ?? [];
    if (existing.length > 0) {
        console.log(`[DEBUG] Removing ${existing.length} existing torrent(s)`);
        existing.forEach((t: Torrent) => client.remove(t.infoHash, { destroyStore: true }));
    }

    return new Promise((resolve, reject) => {
        console.log('[DEBUG] Adding torrent to client');
        getClient().add(magnetUri, {}, async (torrent: Torrent) => {
            console.log('[DEBUG] Torrent ready, infoHash:', torrent.infoHash);
            try {
                console.log('[DEBUG] Creating stream server');
                const { server, streamUrl, mimeType } = await createStreamServer(torrent);
                activeServer = server;
                console.log('[DEBUG] Stream server ready:', streamUrl, mimeType);
                resolve({ torrentId: torrent.infoHash, streamUrl, mimeType });
            } catch (e) {
                console.error('[DEBUG] Failed to create stream server:', e);
                reject(e);
            }
        });
    });
}

export async function stopTorrent(torrentId: string): Promise<void> {
    console.log('[DEBUG] stopTorrent called:', torrentId);
    closeActiveServer();
    return new Promise((resolve, reject) => {
        console.log('[DEBUG] Removing torrent from client');
        getClient().remove(torrentId, { destroyStore: true }, (err: any) => {
            if (err) {
                console.error('[DEBUG] Failed to remove torrent:', err);
                reject(err);
            } else {
                console.log('[DEBUG] Torrent removed');
                resolve();
            }
        });
    });
}
