import http from 'http';
import path from 'path';
import { PassThrough } from 'stream';
import { Torrent } from 'webtorrent';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegPath!);
ffmpeg.setFfprobePath((ffprobePath as any).path ?? ffprobePath);

const MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/mp4',
    '.avi': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/mp4',
};

const SUBTITLE_EXTS = new Set(['.srt', '.vtt']);

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

const IMAGE_SUBTITLE_CODECS = new Set([
    'dvd_subtitle',
    'hdmv_pgs_subtitle',
    'dvbsub',
    'xsub',
    'pgssub',
]);

function detectLang(filename: string): { lang: string; label: string } {
    const base = path.basename(filename, path.extname(filename)).toLowerCase();
    const parts = base.split(/[.\-_ \[\]()]/);
    for (const part of [...parts].reverse()) {
        if (LANG_MAP[part]) return { lang: part.slice(0, 2), label: LANG_MAP[part] };
    }
    return { lang: 'und', label: path.basename(filename, path.extname(filename)) };
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

function probeEmbeddedSubtitles(
    filePath: string
): Promise<{ streamIndex: number; lang: string; label: string }[]> {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(
            filePath,
            ['-probesize', '10000000', '-analyzeduration', '0'],
            (err, metadata) => {
                if (err) {
                    console.error('[DEBUG] ffprobe error:', err.message);
                    resolve([]);
                    return;
                }
                const tracks = (metadata.streams ?? [])
                    .filter(
                        (s) =>
                            s.codec_type === 'subtitle' &&
                            !IMAGE_SUBTITLE_CODECS.has(s.codec_name ?? '')
                    )
                    .map((s, i) => {
                        const tags = (s.tags ?? {}) as Record<string, string>;
                        const rawLang = tags.language ?? 'und';
                        return {
                            streamIndex: s.index!,
                            lang: rawLang.slice(0, 2),
                            label:
                                tags.title ??
                                LANG_MAP[rawLang] ??
                                LANG_MAP[rawLang.slice(0, 2)] ??
                                `Track ${i + 1}`,
                        };
                    });
                console.log('[DEBUG] Embedded subtitle streams:', tracks);
                resolve(tracks);
            }
        );
    });
}

function extractSubtitleVtt(filePath: string, streamIndex: number): Promise<string> {
    return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        const pass = new PassThrough();
        pass.on('data', (c: Buffer) => chunks.push(c));
        pass.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        pass.on('error', () => resolve('WEBVTT\n'));

        ffmpeg(filePath)
            .addOutputOption(`-map 0:${streamIndex}`)
            .format('webvtt')
            .on('error', (err) => {
                console.error('[DEBUG] ffmpeg subtitle extract error:', err.message);
                resolve('WEBVTT\n');
            })
            .pipe(pass, { end: true });
    });
}

type SubtitleTrack = { lang: string; label: string; url: string };

export async function createStreamServer(
    torrent: Torrent,
    onSubtitlesReady?: (subtitles: SubtitleTrack[]) => void
): Promise<{
    server: http.Server;
    streamUrl: string;
    mimeType: string;
    subtitles: SubtitleTrack[];
}> {
    return new Promise((resolve, reject) => {
        const file = torrent.files
            .filter((f: any) => Object.keys(MIME_TYPES).some((ext) => f.name.endsWith(ext)))
            .sort((a: any, b: any) => b.length - a.length)[0];

        if (!file) {
            reject(new Error('No video file found in torrent'));
            return;
        }

        const ext = path.extname(file.name).toLowerCase();
        const mimeType = MIME_TYPES[ext] ?? 'video/mp4';

        const sidecarFiles = torrent.files.filter((f: any) =>
            SUBTITLE_EXTS.has(path.extname(f.name).toLowerCase())
        );

        console.log('[DEBUG] Selected video file:', file.name, `(${file.length} bytes)`, mimeType);
        console.log(
            '[DEBUG] Sidecar subtitle files:',
            sidecarFiles.map((f: any) => f.name)
        );

        // Keyed by subtitle index, lazy-extracted on first request
        const embeddedSubCache = new Map<number, Promise<string>>();
        let embeddedTracks: { streamIndex: number; lang: string; label: string }[] = [];
        let serverPort = 0;

        const server = http.createServer(async (req, res) => {
            const url = req.url ?? '/';

            // Sidecar subtitle files
            if (url.startsWith('/subtitles/sidecar/')) {
                const idx = parseInt(url.split('/')[3], 10);
                const subFile = sidecarFiles[idx];
                if (!subFile || isNaN(idx)) {
                    res.writeHead(404);
                    res.end();
                    return;
                }

                const subExt = path.extname(subFile.name).toLowerCase();
                res.writeHead(200, {
                    'Content-Type': 'text/vtt; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                });

                if (subExt === '.vtt') {
                    subFile.createReadStream().pipe(res);
                } else {
                    const chunks: Buffer[] = [];
                    subFile
                        .createReadStream()
                        .on('data', (c: Buffer) => chunks.push(c))
                        .on('end', () => res.end(srtToVtt(Buffer.concat(chunks).toString('utf-8'))))
                        .on('error', () => res.end('WEBVTT\n'));
                }
                return;
            }

            // Embedded subtitle tracks (extracted via ffmpeg on demand)
            if (url.startsWith('/subtitles/embedded/')) {
                const idx = parseInt(url.split('/')[3], 10);
                const track = embeddedTracks[idx];
                if (!track || isNaN(idx)) {
                    res.writeHead(404);
                    res.end();
                    return;
                }

                if (!embeddedSubCache.has(idx)) {
                    embeddedSubCache.set(
                        idx,
                        extractSubtitleVtt(`http://localhost:${serverPort}/`, track.streamIndex)
                    );
                }

                const vtt = await embeddedSubCache.get(idx)!;
                res.writeHead(200, {
                    'Content-Type': 'text/vtt; charset=utf-8',
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(vtt);
                return;
            }

            // Video stream
            const fileSize = file.length;
            const range = req.headers.range;
            console.log(`[DEBUG] Stream request — range: ${range ?? 'none'}`);

            if (range) {
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = Math.min(endStr ? parseInt(endStr, 10) : fileSize - 1, fileSize - 1);
                console.log(`[DEBUG] Serving range bytes ${start}-${end}/${fileSize}`);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': mimeType,
                    'Access-Control-Allow-Origin': '*',
                });
                const rangeStream = file.createReadStream({ start, end });
                res.on('close', () => rangeStream.destroy());
                rangeStream.on('error', () => {});
                rangeStream.pipe(res);
            } else {
                console.log(`[DEBUG] Serving full file (${fileSize} bytes)`);
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Access-Control-Allow-Origin': '*',
                });
                const fullStream = file.createReadStream();
                res.on('close', () => fullStream.destroy());
                fullStream.on('error', () => {});
                fullStream.pipe(res);
            }
        });

        server.listen(0, '127.0.0.1', async () => {
            serverPort = (server.address() as any).port;
            console.log('[DEBUG] Stream server listening on port', serverPort);

            const sidecarSubtitles: SubtitleTrack[] = sidecarFiles.map((f: any, i: number) => ({
                ...detectLang(f.name),
                url: `http://localhost:${serverPort}/subtitles/sidecar/${i}`,
            }));

            resolve({
                server,
                streamUrl: `http://localhost:${serverPort}`,
                mimeType,
                subtitles: sidecarSubtitles,
            });

            embeddedTracks = await probeEmbeddedSubtitles(`http://localhost:${serverPort}/`);
            const embeddedSubtitles: SubtitleTrack[] = embeddedTracks.map((t, i) => ({
                lang: t.lang,
                label: t.label,
                url: `http://localhost:${serverPort}/subtitles/embedded/${i}`,
            }));
            const allSubtitles: SubtitleTrack[] = [...sidecarSubtitles, ...embeddedSubtitles];
            console.log('[DEBUG] All subtitle tracks:', allSubtitles);
            onSubtitlesReady?.(allSubtitles);
        });
    });
}
