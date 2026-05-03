import path from 'path';
import http from 'http';
import { Torrent } from 'webtorrent';
import { TorrentFile } from '../fs/TorrentFile';
import { createRangeServer, type FontAttachment } from '../fs/httpServer';
import { bootstrapMatroskaSubtitles } from './matroskaSubtitles';

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov']);
const SUBTITLE_EXTS = new Set(['.srt', '.vtt']);

const MIME_FOR_EXT: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/mp4',
};

const LANG_MAP: Record<string, string> = {
    en: 'English',
    eng: 'English',
    es: 'Spanish',
    spa: 'Spanish',
    fr: 'French',
    fre: 'French',
    de: 'German',
    ger: 'German',
    it: 'Italian',
    ita: 'Italian',
    pt: 'Portuguese',
    por: 'Portuguese',
    ru: 'Russian',
    rus: 'Russian',
    ja: 'Japanese',
    jpn: 'Japanese',
    ko: 'Korean',
    kor: 'Korean',
    zh: 'Chinese',
    chi: 'Chinese',
    nl: 'Dutch',
    nld: 'Dutch',
    pl: 'Polish',
    pol: 'Polish',
};

function logStream(...args: unknown[]) {
    console.log(`[stream ${new Date().toISOString()}]`, ...args);
}

function srtToVtt(srt: string): string {
    return (
        'WEBVTT\n\n' +
        srt
            .replace(/\r\n/g, '\n')
            .replace(/^﻿/, '')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    );
}

function detectLang(filename: string): { lang: string; label: string } {
    const base = path.basename(filename, path.extname(filename)).toLowerCase();
    for (const part of base.split(/[.\-_ \[\]()]/).reverse()) {
        if (LANG_MAP[part]) return { lang: part.slice(0, 2), label: LANG_MAP[part] };
    }
    return { lang: 'und', label: path.basename(filename, path.extname(filename)) };
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

export async function createMediaSession(
    torrent: Torrent,
    onSubtitlesReady: (subs: SubtitleTrack[]) => void
): Promise<{ server: http.Server; streamUrl: string; mimeType: string }> {
    const rawFile = torrent.files
        .filter((f: any) => VIDEO_EXTS.has(path.extname(f.name).toLowerCase()))
        .sort((a: any, b: any) => b.length - a.length)[0];

    if (!rawFile) throw new Error('No video file in torrent');

    const mimeType = MIME_FOR_EXT[path.extname(rawFile.name).toLowerCase()] ?? 'video/mp4';
    const sidecarFiles = torrent.files.filter((f: any) =>
        SUBTITLE_EXTS.has(path.extname(f.name).toLowerCase())
    );

    const torrentFile = new TorrentFile(rawFile);
    const fontAttachments: FontAttachment[] = [];
    const { server, playbackUrl, sourceUrl, fontBaseUrl } = await createRangeServer(
        torrentFile,
        mimeType,
        fontAttachments
    );
    logStream('Range server up:', playbackUrl, '-', rawFile.name);

    void bootstrapSubtitleSession(
        torrentFile,
        mimeType,
        sourceUrl,
        fontBaseUrl,
        sidecarFiles,
        fontAttachments,
        onSubtitlesReady
    );

    return { server, streamUrl: playbackUrl, mimeType };
}

async function bootstrapSubtitleSession(
    torrentFile: TorrentFile,
    mimeType: string,
    sourceUrl: string,
    fontBaseUrl: string,
    sidecarFiles: any[],
    fontAttachments: FontAttachment[],
    onSubtitlesReady: (subs: SubtitleTrack[]) => void
): Promise<void> {
    const sidecar: SubtitleTrack[] = await Promise.all(
        sidecarFiles.map(async (file) => ({
            ...detectLang(file.name),
            content: await readSidecarVtt(file),
            format: 'vtt' as const,
        }))
    );

    if (mimeType === 'video/x-matroska') {
        try {
            const result = await bootstrapMatroskaSubtitles(torrentFile, fontBaseUrl);
            if (result) {
                fontAttachments.splice(0, fontAttachments.length, ...result.fontAttachments);
                if (result.fontAttachments.length > 0) {
                    logStream('Font attachments ready:', result.fontAttachments.length);
                }
                const tracks = [...sidecar, ...result.tracks];
                onSubtitlesReady(tracks);
                logStream(
                    'Subtitles ready:',
                    tracks.map((track) => `${track.label}(${track.lang})`)
                );
                return;
            }
        } catch (error) {
            console.error(
                '[stream]',
                new Date().toISOString(),
                'MKV subtitle bootstrap failed:',
                error instanceof Error ? error.message : error
            );
        }
    }

    onSubtitlesReady(sidecar);
    logStream(
        'Subtitles ready:',
        sidecar.map((track) => `${track.label}(${track.lang})`)
    );
    logStream('No embedded subtitle bootstrap available for:', sourceUrl);
}
