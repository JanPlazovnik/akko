import { Torrent, WebTorrentOptions } from 'webtorrent';
import { createMediaSession, SubtitleTrack } from './stream';
import { sendToRenderer } from '../context';
import { createLogger } from '../logger';

const log = createLogger('torrent');

let client: any = null;
let activeServer: { close(): Promise<void> | void } | null = null;

export async function initClient(opts?: WebTorrentOptions) {
    const WebTorrent = (await import('webtorrent')).default;
    client = new WebTorrent(opts);
    log.info('Client ready');
}

function getClient() {
    if (!client) throw new Error('Torrent client not initialized');
    return client;
}

async function closeActiveServer() {
    if (activeServer) {
        await activeServer.close();
        activeServer = null;
    }
}

export async function startTorrent(magnetUri: string): Promise<{
    torrentId: string;
    streamUrl: string;
    mimeType: string;
}> {
    await closeActiveServer();

    const existing: Torrent[] = client?.torrents ?? [];
    if (existing.length > 0) {
        existing.forEach((t) => client.remove(t.infoHash, { destroyStore: true }));
    }

    return new Promise((resolve, reject) => {
        getClient().add(magnetUri, {}, async (torrent: Torrent) => {
            try {
                const { server, streamUrl, mimeType } = await createMediaSession(
                    torrent,
                    (subs: SubtitleTrack[]) => sendToRenderer('stream:subtitles', subs)
                );
                activeServer = server;
                resolve({ torrentId: torrent.infoHash, streamUrl, mimeType });
            } catch (e) {
                reject(e);
            }
        });
    });
}

export async function stopTorrent(torrentId: string): Promise<void> {
    await closeActiveServer();
    return new Promise((resolve, reject) => {
        getClient().remove(torrentId, { destroyStore: true }, (err: any) => {
            if (err) reject(err);
            else resolve();
        });
    });
}
