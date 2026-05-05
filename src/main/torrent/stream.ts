import path from 'path';
import { AttachmentSession, detectLang } from './attachments';
import { createLogger } from '../logger';

const log = createLogger('stream');

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov']);
const SUBTITLE_EXTS = new Set(['.srt', '.vtt']);

const MIME_FOR_EXT: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/mp4',
};

function srtToVtt(srt: string): string {
    return (
        'WEBVTT\n\n' +
        srt
            .replace(/\r\n/g, '\n')
            .replace(/^﻿/, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    );
}

function readSidecarVtt(file: any): Promise<string> {
    return new Promise((resolve) => {
        const ext = path.extname(file.name).toLowerCase();
        const chunks: Buffer[] = [];
        file.createReadStream()
            .on('data', (c: Buffer) => chunks.push(c))
            .on('end', () => {
                const text = Buffer.concat(chunks).toString('utf-8');
                resolve(ext === '.vtt' ? text : srtToVtt(text));
            })
            .on('error', () => resolve('WEBVTT\n'));
    });
}

export type SubtitleTrack = {
    lang: string;
    label: string;
    content: string;
    format?: 'vtt' | 'ass';
    fonts?: string[];
};

type ClosableSession = {
    close(): Promise<void> | void;
};

async function ensurePlaybackServer(client: any): Promise<any> {
    const existing = client._server;
    if (existing && typeof existing.address === 'function') {
        const address = existing.address();
        if (address?.port) return existing;
    }

    const server = client.createServer({ origin: '*', pathname: '/webtorrent' });
    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    return server;
}

function buildStreamUrl(server: any, torrent: any, file: any): string {
    const address = server.address();
    const pathname = server.pathname ?? '/webtorrent';
    const encodedPath = String(file.path)
        .split(/[\\/]/)
        .map((part) => encodeURIComponent(part))
        .join('/');
    return `http://127.0.0.1:${address.port}${pathname}/${torrent.infoHash}/${encodedPath}`;
}

export async function createMediaSession(
    torrent: any,
    onSubtitlesReady: (subs: SubtitleTrack[]) => void
): Promise<{ server: ClosableSession; streamUrl: string; mimeType: string }> {
    const rawFile = torrent.files
        .filter((f: any) => VIDEO_EXTS.has(path.extname(f.name).toLowerCase()))
        .sort((a: any, b: any) => b.length - a.length)[0];

    if (!rawFile) throw new Error('No video file in torrent');

    const mimeType = MIME_FOR_EXT[path.extname(rawFile.name).toLowerCase()] ?? 'video/mp4';
    const sidecarFiles = torrent.files.filter((f: any) =>
        SUBTITLE_EXTS.has(path.extname(f.name).toLowerCase())
    );
    const sidecarTracks = await Promise.all(
        sidecarFiles.map(async (file: any) => ({
            ...detectLang(file.name),
            content: await readSidecarVtt(file),
            format: 'vtt' as const,
        }))
    );

    const client = rawFile._client ?? torrent.client ?? torrent._client;
    if (!client) throw new Error('Unable to access WebTorrent client for playback server');

    const playbackServer = await ensurePlaybackServer(client);
    const streamUrl = buildStreamUrl(playbackServer, torrent, rawFile);
    log.debug('Playback server up:', streamUrl, '-', rawFile.name);

    let attachmentSession: AttachmentSession | null = null;
    if (mimeType === 'video/x-matroska') {
        attachmentSession = await AttachmentSession.create(
            rawFile,
            torrent.infoHash,
            torrent.files.indexOf(rawFile),
            sidecarTracks,
            onSubtitlesReady
        );
    } else {
        onSubtitlesReady(sidecarTracks);
        log.debug(
            'Subtitles ready:',
            sidecarTracks.map((track) => `${track.label}(${track.lang})`)
        );
    }

    return {
        server: {
            close: async () => {
                await attachmentSession?.close();
            },
        },
        streamUrl,
        mimeType,
    };
}
