import path from 'node:path';
import { parse } from 'anitomy';
import type WebTorrent from 'webtorrent';
import type { Torrent, TorrentFile, TorrentServer } from 'webtorrent';
import {
    HEALTHY_DHT_NODES,
    type AppSettings,
    type FileMatch,
    type NetworkCheck,
    type StreamStartResult,
    type StreamStats,
} from '../../shared/ipc/api';
import { sendToRenderer } from '../context';
import { SubtitleSession } from '../subtitles/session';
import { dbGetSettings } from '../db';
import { defaultDownloadPath } from '../paths';
import { createLogger } from '../logger';
import { probeTrackers } from './network';
import type { EpisodeNumbers } from '../../shared/anizip/types';
import { describeEpisode } from '../../shared/media/types';

const log = createLogger('torrent');

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.webm', '.avi', '.mov']);
const SIDECAR_EXTS = new Set(['.srt', '.vtt']);
const METADATA_TIMEOUT_MS = 60_000;
const HEADER_TIMEOUT_MS = 60_000;
const STATS_INTERVAL_MS = 1000;
const DHT_WAIT_MS = 10_000;

let client: WebTorrent | null = null;
let server: TorrentServer | null = null;
let active: {
    torrent: Torrent;
    subtitles: SubtitleSession;
    statsTimer: ReturnType<typeof setInterval>;
} | null = null;
let pendingStart: AbortController | null = null;
let queue: Promise<unknown> = Promise.resolve();

export function applyTorrentSettings(settings: AppSettings) {
    if (!client) return;
    const rate = (kbps: number) => (kbps > 0 ? kbps * 1024 : -1);
    client.throttleDownload(rate(settings.downloadLimit));
    client.throttleUpload(rate(settings.uploadLimit));
    client.maxConns = settings.maxConnections;
}

let clientReady: Promise<void> | null = null;

export function initClient(): Promise<void> {
    clientReady ??= (async () => {
        const { default: WebTorrent } = await import('webtorrent');
        client = new WebTorrent();
        applyTorrentSettings(dbGetSettings());
        const torrentServer = client.createServer({
            hostname: '127.0.0.1',
            pathname: '/webtorrent',
        });
        await new Promise<void>((resolve) => torrentServer.listen(0, '127.0.0.1', resolve));
        server = torrentServer;
        log.info('Client ready');
    })();
    return clientReady;
}

function getClient() {
    if (!client) throw new Error('Torrent client not initialized');
    return client;
}

async function waitForDht(): Promise<number> {
    await initClient();
    const dht = getClient().dht;
    if (!dht) return 0;
    const deadline = Date.now() + DHT_WAIT_MS;
    while (dht.nodes.count() < HEALTHY_DHT_NODES && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return dht.nodes.count();
}

export async function checkNetwork(): Promise<NetworkCheck> {
    const [trackers, dhtNodes] = await Promise.all([probeTrackers(), waitForDht()]);
    log.info(
        `Network check: ${trackers.reached}/${trackers.total} trackers, ${dhtNodes} DHT nodes`
    );
    return { trackersReached: trackers.reached, trackersTotal: trackers.total, dhtNodes };
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

type ParsedFile = { season: number | null; episode: number | null };

function parseFile(file: TorrentFile): ParsedFile {
    const parsed = parse(file.name);
    const season = Number(parsed?.season);
    return {
        season: Number.isInteger(season) ? season : null,
        episode: parsed?.episode.number ?? null,
    };
}

// Releases number episodes per AniList entry, per TVDB season or across the whole series.
// The most specific scheme that fits wins; a season that disagrees with TVDB is a weak match.
function matchScore({ season, episode }: ParsedFile, target: EpisodeNumbers): number {
    if (episode === null) return 0;
    if (season !== null && target.season !== null && season !== target.season) {
        return episode === target.number ? 1 : 0;
    }
    if (season !== null && episode === target.seasonEpisode) return 4;
    if (episode === target.number) return 3;
    if (episode === target.seasonEpisode || episode === target.absoluteNumber) return 2;
    return 0;
}

function describeFile(file: TorrentFile, { season, episode } = parseFile(file)) {
    return `${file.name} (season ${season ?? '-'}, episode ${episode ?? '-'})`;
}

function pickVideo(
    videos: TorrentFile[],
    target?: EpisodeNumbers
): { video: TorrentFile; match: FileMatch } {
    if (videos.length === 1) {
        const parsed = parseFile(videos[0]);
        log.info('Single video:', describeFile(videos[0], parsed));
        if (target && matchScore(parsed, target) === 0) {
            log.warn(`Single video doesn't look like ${describeEpisode(target)}`);
        }
        return { video: videos[0], match: 'single' };
    }
    if (!target) {
        log.warn(`No episode given for ${videos.length} videos, using largest`);
        return { video: videos[0], match: 'fallback' };
    }

    log.info(`Picking ${describeEpisode(target)} from ${videos.length} videos`);
    let best = { video: videos[0], score: 0 };
    for (const video of videos) {
        const parsed = parseFile(video);
        const score = matchScore(parsed, target);
        if (score > 0) log.debug(`Score ${score}:`, describeFile(video, parsed));
        if (score > best.score) best = { video, score };
    }
    if (best.score === 0) {
        log.warn(`No file matched ${describeEpisode(target)}, using largest:`, videos[0].name);
        return { video: videos[0], match: 'fallback' };
    }
    log.info(`Matched ${describeEpisode(target)} with score ${best.score}:`, best.video.name);
    return { video: best.video, match: 'episode' };
}

function pickFiles(files: TorrentFile[], episode?: EpisodeNumbers) {
    const videos = files
        .filter((f) => VIDEO_EXTS.has(extension(f)))
        .sort((a, b) => b.length - a.length);
    if (videos.length === 0) throw new Error('No video file in torrent');

    const isBatch = videos.length > 1;
    const { video, match } = pickVideo(videos, episode);

    const subtitles = files.filter((f) => SIDECAR_EXTS.has(extension(f)));
    const matching = subtitles.filter((f) => f.name.startsWith(stem(video)));
    return { video, match, sidecars: matching.length > 0 || isBatch ? matching : subtitles };
}

function streamUrl(torrent: Torrent, file: TorrentFile): string {
    if (!server) throw new Error('Torrent server not initialized');
    // webtorrent matches the path with decodeURI, which leaves reserved characters encoded
    const filePath = encodeURI(file.path.replace(/\\/g, '/')).replace(/[?#]/g, encodeURIComponent);
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
        const started = Date.now();
        log.debug('Destroying torrent', torrent.infoHash);
        torrent.destroy({ destroyStore: !dbGetSettings().keepFiles }, (err) => {
            if (err) log.warn('Failed to destroy torrent:', err);
            log.debug(`Destroyed torrent ${torrent.infoHash} in ${Date.now() - started}ms`);
            resolve();
        });
    });
}

function addTorrent(magnet: string): { torrent: Torrent; ready: Promise<void> } {
    const { downloadPath, maxConnections } = dbGetSettings();
    const torrent = getClient().add(magnet, {
        deselect: true,
        path: downloadPath ?? defaultDownloadPath(),
        maxConns: maxConnections,
    });
    const ready = new Promise<void>((resolve, reject) => {
        torrent.once('error', reject);
        torrent.once('ready', () => {
            torrent.removeListener('error', reject);
            resolve();
        });
    });
    return { torrent, ready };
}

// Rejects when a newer start or a stop supersedes this one, or when peers never deliver
function guard<T>(step: Promise<T>, signal: AbortSignal, timeoutMs: number, message: string) {
    let cleanup: (() => void) | undefined;
    const stop = new Promise<never>((_, reject) => {
        const cancel = () => reject(new Error('Cancelled'));
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
        cleanup = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', cancel);
        };
    });
    return Promise.race([step, stop]).finally(() => cleanup?.());
}

async function stopActive() {
    if (!active) return;
    const { torrent, subtitles, statsTimer } = active;
    active = null;
    clearInterval(statsTimer);
    subtitles.destroy();
    await destroyTorrent(torrent);
}

async function openStream(
    magnet: string,
    episode: EpisodeNumbers | undefined,
    signal: AbortSignal
): Promise<StreamStartResult> {
    log.debug('Adding torrent', magnet.slice(0, 80));
    const { torrent, ready } = addTorrent(magnet);
    let opening: Promise<SubtitleSession> | undefined;
    try {
        await guard(ready, signal, METADATA_TIMEOUT_MS, 'Timed out waiting for torrent metadata');
        log.debug(`Got metadata for ${torrent.infoHash}, ${torrent.files.length} files`);
        const { video, match, sidecars } = pickFiles(torrent.files, episode);
        video.select();
        log.debug('Reading video header');
        opening = SubtitleSession.open(torrent.infoHash, video, sidecars);
        const subtitles = await guard(
            opening,
            signal,
            HEADER_TIMEOUT_MS,
            'Timed out waiting for peers to send the video'
        );
        const statsTimer = setInterval(
            () => sendToRenderer('stream:stats', torrent.infoHash, stats(torrent, video)),
            STATS_INTERVAL_MS
        );
        active = { torrent, subtitles, statsTimer };
        log.debug('Streaming', video.name);
        return {
            torrentId: torrent.infoHash,
            match,
            streamUrl: streamUrl(torrent, video),
            tracks: subtitles.tracks,
            audioTracks: subtitles.audioTracks,
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message === 'Cancelled') log.debug('Stream start cancelled');
        else log.warn('Stream start failed:', message);
        opening?.then(
            (session) => session.destroy(),
            () => undefined
        );
        await destroyTorrent(torrent);
        throw err;
    }
}

export function startTorrent(magnet: string, episode?: EpisodeNumbers): Promise<StreamStartResult> {
    pendingStart?.abort();
    const start = new AbortController();
    pendingStart = start;
    return serialized(async () => {
        try {
            if (start.signal.aborted) throw new Error('Cancelled');
            await initClient();
            await stopActive();
            return await openStream(magnet, episode, start.signal);
        } finally {
            if (pendingStart === start) pendingStart = null;
        }
    });
}

// A stop for a specific torrent must not cancel a newer start that is still loading
export function stopTorrent(torrentId: string | null): Promise<void> {
    if (!torrentId) pendingStart?.abort();
    return serialized(async () => {
        if (!torrentId || active?.torrent.infoHash === torrentId) await stopActive();
    });
}
