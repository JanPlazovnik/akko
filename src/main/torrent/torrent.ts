import path from 'node:path';
import type WebTorrent from 'webtorrent';
import type { Torrent, TorrentFile, TorrentServer } from 'webtorrent';
import type { AppSettings, StreamStartResult, StreamStats } from '../../shared/ipc/api';
import { sendToRenderer } from '../context';
import { SubtitleSession } from '../subtitles/session';
import { dbGetSettings } from '../db';
import { defaultDownloadPath } from '../paths';
import { createLogger } from '../logger';

const log = createLogger('torrent');

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.webm', '.avi', '.mov']);
const SIDECAR_EXTS = new Set(['.srt', '.vtt']);
const METADATA_TIMEOUT_MS = 60_000;
const STATS_INTERVAL_MS = 1000;

const EPISODE_PATTERNS = [
    /(?:\bS\d+|\d)E0*(\d+)/i,
    /\b(?:EP?|Episode)\s?0*(\d+)\b/i,
    /\s-\s0*(\d+)(?:v\d)?\b/,
    /(?:^|\s)0*(\d{1,4})(?:v\d)?(?:\s|$)/,
];

let client: WebTorrent | null = null;
let server: TorrentServer | null = null;
let active: {
    torrent: Torrent;
    subtitles: SubtitleSession;
    statsTimer: ReturnType<typeof setInterval>;
} | null = null;
let cancelPending: (() => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function applyTorrentSettings(settings: AppSettings) {
    if (!client) return;
    const rate = (kbps: number) => (kbps > 0 ? kbps * 1024 : -1);
    client.throttleDownload(rate(settings.downloadLimit));
    client.throttleUpload(rate(settings.uploadLimit));
    client.maxConns = settings.maxConnections;
}

export async function initClient(settings: AppSettings) {
    const { default: WebTorrent } = await import('webtorrent');
    client = new WebTorrent();
    applyTorrentSettings(settings);
    const torrentServer = client.createServer({ hostname: '127.0.0.1', pathname: '/webtorrent' });
    await new Promise<void>((resolve) => torrentServer.listen(0, '127.0.0.1', resolve));
    server = torrentServer;
    log.info('Client ready');
}

function getClient() {
    if (!client) throw new Error('Torrent client not initialized');
    return client;
}

function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
}

function extension(file: TorrentFile): string {
    return path.extname(file.name).toLowerCase();
}

function stem(file: TorrentFile): string {
    return path.basename(file.name, path.extname(file.name));
}

function episodeNumber(name: string): number | null {
    const normalized = name.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[._]/g, ' ');
    for (const pattern of EPISODE_PATTERNS) {
        const match = normalized.match(pattern);
        if (match) return Number(match[1]);
    }
    return null;
}

function pickFiles(files: TorrentFile[], episode?: number) {
    const videos = files
        .filter((f) => VIDEO_EXTS.has(extension(f)))
        .sort((a, b) => b.length - a.length);
    if (videos.length === 0) throw new Error('No video file in torrent');

    const isBatch = videos.length > 1;
    const matched =
        isBatch && episode !== undefined
            ? videos.find((f) => episodeNumber(stem(f)) === episode)
            : undefined;
    if (isBatch && !matched) log.warn(`No file matched episode ${episode}, using largest`);
    const video = matched ?? videos[0];

    const subtitles = files.filter((f) => SIDECAR_EXTS.has(extension(f)));
    const matching = subtitles.filter((f) => f.name.startsWith(stem(video)));
    return { video, sidecars: matching.length > 0 || isBatch ? matching : subtitles };
}

function streamUrl(torrent: Torrent, file: TorrentFile): string {
    if (!server) throw new Error('Torrent server not initialized');
    const filePath = file.path.split(/[\\/]/).map(encodeURIComponent).join('/');
    return `http://127.0.0.1:${server.address().port}${server.pathname}/${torrent.infoHash}/${filePath}`;
}

function stats(torrent: Torrent, file: TorrentFile): StreamStats {
    return {
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        peers: torrent.numPeers,
        progress: file.progress,
        downloaded: file.downloaded,
        size: file.length,
    };
}

function destroyTorrent(torrent: Torrent): Promise<void> {
    return new Promise((resolve) => {
        if (torrent.destroyed) return resolve();
        torrent.destroy({ destroyStore: !dbGetSettings().keepFiles }, (err) => {
            if (err) log.warn('Failed to destroy torrent:', err);
            resolve();
        });
    });
}

function addTorrent(magnet: string): Promise<Torrent> {
    return new Promise((resolve, reject) => {
        const fail = (err: Error) => {
            clearTimeout(timer);
            cancelPending = null;
            void destroyTorrent(torrent);
            reject(err);
        };
        const timer = setTimeout(
            () => fail(new Error('Timed out waiting for torrent metadata')),
            METADATA_TIMEOUT_MS
        );
        const { downloadPath, maxConnections } = dbGetSettings();
        const options = {
            deselect: true,
            path: downloadPath ?? defaultDownloadPath(),
            maxConns: maxConnections,
        };
        const torrent = getClient().add(magnet, options, (ready) => {
            clearTimeout(timer);
            cancelPending = null;
            torrent.removeListener('error', fail);
            resolve(ready);
        });
        torrent.once('error', fail);
        cancelPending = () => fail(new Error('Cancelled'));
    });
}

async function stopActive() {
    if (!active) return;
    const { torrent, subtitles, statsTimer } = active;
    active = null;
    clearInterval(statsTimer);
    subtitles.destroy();
    await destroyTorrent(torrent);
}

export function startTorrent(magnet: string, episode?: number): Promise<StreamStartResult> {
    cancelPending?.();
    return serialized(async () => {
        await stopActive();
        const torrent = await addTorrent(magnet);
        try {
            const { video, sidecars } = pickFiles(torrent.files, episode);
            video.select();
            const subtitles = await SubtitleSession.open(torrent.infoHash, video, sidecars);
            const statsTimer = setInterval(
                () => sendToRenderer('stream:stats', torrent.infoHash, stats(torrent, video)),
                STATS_INTERVAL_MS
            );
            active = { torrent, subtitles, statsTimer };
            log.debug('Streaming', video.name);
            return {
                torrentId: torrent.infoHash,
                streamUrl: streamUrl(torrent, video),
                tracks: subtitles.tracks,
                audioTracks: subtitles.audioTracks,
            };
        } catch (err) {
            await destroyTorrent(torrent);
            throw err;
        }
    });
}

export function stopTorrent(torrentId: string | null): Promise<void> {
    cancelPending?.();
    return serialized(async () => {
        if (!torrentId || active?.torrent.infoHash === torrentId) await stopActive();
    });
}
