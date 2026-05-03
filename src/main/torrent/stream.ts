import path from 'path';
import http from 'http';
import { PassThrough } from 'stream';
import { Torrent } from 'webtorrent';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import { TorrentFile } from '../fs/TorrentFile';
import { createRangeServer } from '../fs/httpServer';

ffmpeg.setFfmpegPath(ffmpegPath!);
ffmpeg.setFfprobePath((ffprobePath as any).path ?? ffprobePath);

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov']);
const SUBTITLE_EXTS = new Set(['.srt', '.vtt']);

const MIME_FOR_EXT: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/mp4',
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

const IMAGE_SUB_CODECS = new Set(['dvd_subtitle', 'hdmv_pgs_subtitle', 'dvbsub', 'xsub', 'pgssub']);

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

function probeSubtitleStreams(
    fileUrl: string
): Promise<{ index: number; lang: string; label: string }[]> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(
            fileUrl,
            ['-probesize', '10000000', '-analyzeduration', '0'],
            (err, meta) => {
                if (err) {
                    console.error('[stream] ffprobe error:', err.message);
                    resolve([]);
                    return;
                }
                resolve(
                    (meta.streams ?? [])
                        .filter(
                            (s) =>
                                s.codec_type === 'subtitle' &&
                                !IMAGE_SUB_CODECS.has(s.codec_name ?? '')
                        )
                        .map((s, i) => {
                            const tags = (s.tags ?? {}) as Record<string, string>;
                            const rawLang = tags.language ?? 'und';
                            return {
                                index: s.index!,
                                lang: rawLang.slice(0, 2),
                                label:
                                    tags.title ??
                                    LANG_MAP[rawLang] ??
                                    LANG_MAP[rawLang.slice(0, 2)] ??
                                    `Track ${i + 1}`,
                            };
                        })
                );
            }
        );
    });
}

function extractSubtitleVtt(fileUrl: string, streamIndex: number): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        const pass = new PassThrough();
        pass.on('data', (c: Buffer) => chunks.push(c));
        pass.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        pass.on('error', () => resolve('WEBVTT\n'));
        ffmpeg(fileUrl)
            .addOutputOption(`-map 0:${streamIndex}`)
            .format('webvtt')
            .on('error', (err) => {
                console.error('[stream] ffmpeg subtitle error:', err.message);
                resolve('WEBVTT\n');
            })
            .pipe(pass, { end: true });
    });
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

export type SubtitleTrack = { lang: string; label: string; content: string };

export async function createMediaSession(
    torrent: Torrent,
    onSubtitlesReady: (subs: SubtitleTrack[]) => void
): Promise<{ server: http.Server; streamUrl: string; mimeType: string }> {
    // Pick the largest video file in the torrent
    const rawFile = torrent.files
        .filter((f: any) => VIDEO_EXTS.has(path.extname(f.name).toLowerCase()))
        .sort((a: any, b: any) => b.length - a.length)[0];

    if (!rawFile) throw new Error('No video file in torrent');

    const mimeType = MIME_FOR_EXT[path.extname(rawFile.name).toLowerCase()] ?? 'video/mp4';
    const sidecarFiles = torrent.files.filter((f: any) =>
        SUBTITLE_EXTS.has(path.extname(f.name).toLowerCase())
    );

    // Wrap in virtual file with caching + random-access semantics
    const torrentFile = new TorrentFile(rawFile);

    // HTTP range server backed by TorrentFile - all seeks are served from
    // cache after first download, so ffmpeg probes/seeks are fast on repeat
    const { server, url: fileUrl } = await createRangeServer(torrentFile, mimeType);
    console.log('[stream] Range server up:', fileUrl, '-', rawFile.name);

    // Start subtitle extraction in background immediately - don't block video start
    extractAllSubtitles(fileUrl, sidecarFiles).then(onSubtitlesReady);

    return { server, streamUrl: fileUrl, mimeType };
}

async function extractAllSubtitles(fileUrl: string, sidecarFiles: any[]): Promise<SubtitleTrack[]> {
    const sidecar: SubtitleTrack[] = await Promise.all(
        sidecarFiles.map(async (f) => ({
            ...detectLang(f.name),
            content: await readSidecarVtt(f),
        }))
    );

    const streams = await probeSubtitleStreams(fileUrl);
    console.log('[stream] Embedded subtitle streams found:', streams.length);

    const embedded: SubtitleTrack[] = await Promise.all(
        streams.map(async (s) => ({
            lang: s.lang,
            label: s.label,
            content: await extractSubtitleVtt(fileUrl, s.index),
        }))
    );

    const all = [...sidecar, ...embedded];
    console.log(
        '[stream] Subtitles ready:',
        all.map((t) => `${t.label}(${t.lang})`)
    );
    return all;
}
