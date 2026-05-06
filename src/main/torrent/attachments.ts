import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'path';
import Metadata from 'matroska-metadata';
import type { MatroskaAttachment, MatroskaSubtitle, MatroskaTrack } from 'matroska-metadata';
import { createLogger } from '../logger';

const log = createLogger('stream:attachments');

const ASS_EVENTS_FORMAT =
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';
const EMPTY_ASS = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,40,1

[Events]
${ASS_EVENTS_FORMAT}`;

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

function normalizeLang(lang?: string): string {
    const value = (lang || 'und').toLowerCase();
    return value.length >= 2 ? value.slice(0, 2) : 'und';
}

function trackLabel(track: Pick<MatroskaTrack, 'name' | 'language'>): string {
    if (track.name) return track.name;
    const lang = (track.language || 'und').toLowerCase();
    return LANG_MAP[lang] ?? LANG_MAP[lang.slice(0, 2)] ?? 'Embedded subtitles';
}

function buildAssHeader(header?: string): string {
    const normalized = header?.replace(/\r\n/g, '\n').trim();
    if (!normalized) return EMPTY_ASS;
    const eventsIndex = normalized.search(/\[Events\]/i);
    const preamble =
        eventsIndex >= 0 ? normalized.slice(0, eventsIndex).trimEnd() : normalized.trimEnd();
    return `${preamble}\n\n[Events]\n${ASS_EVENTS_FORMAT}`;
}

export type TrackInfo = {
    trackNumber: string;
    lang: string;
    label: string;
    format: 'vtt' | 'ass';
    header: string;
    fonts: string[];
};

export type SidecarTrack = {
    lang: string;
    label: string;
    format: 'vtt';
    content: string;
};

export function detectLang(filename: string): { lang: string; label: string } {
    const base = path.basename(filename, path.extname(filename)).toLowerCase();
    for (const part of base.split(/[.\-_ \[\]()]/).reverse()) {
        if (LANG_MAP[part]) return { lang: part.slice(0, 2), label: LANG_MAP[part] };
    }
    return { lang: 'und', label: path.basename(filename, path.extname(filename)) };
}

const SUBTITLE_TYPES = new Set(['ass', 'ssa', 'vtt', 'srt', 'subrip', 'webvtt']);

class Attachments {
    private filemap = new Map<string, any>();
    private metadatamap = new Map<any, Metadata>();
    private port = 0;
    private portReady: Promise<void>;

    private server = createServer(async (req, res) => {
        try {
            const { pathname } = new URL(req.url!, 'http://localhost');
            const [hashid, number] = pathname.split('/').slice(1);
            if (!hashid || !number) throw new Error('Invalid request');

            const file = this.filemap.get(hashid);
            if (!file) throw new Error('File not found');

            const metadata = this.metadatamap.get(file);
            if (!metadata) throw new Error('Metadata not found');

            const attachment = (await metadata.getAttachments())[Number(number)] as
                | MatroskaAttachment
                | undefined;
            if (!attachment) throw new Error('Attachment not found');

            res.writeHead(200, {
                'Content-Type': attachment.mimetype || 'application/x-truetype-font',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': attachment.data.byteLength,
            });
            res.end(Buffer.from(attachment.data));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
        }
    });

    constructor() {
        this.portReady = new Promise<void>((resolve) => {
            this.server.listen(0, '127.0.0.1', () => {
                this.port = (this.server.address() as AddressInfo).port;
                resolve();
            });
        });
    }

    private _metadata(hash: string, id: number): Metadata | undefined {
        const file = this.filemap.get(hash + id);
        if (!file) return undefined;
        const existing = this.metadatamap.get(file);
        if (existing) return existing;
        const metadata = new Metadata(file);
        this.metadatamap.set(file, metadata);
        return metadata;
    }

    register(file: any, hash: string, id: number): void {
        this.filemap.clear();
        this.metadatamap.clear();
        this.filemap.set(hash + id, file);
        file.on(
            'iterator',
            (
                { iterator }: { iterator: AsyncIterable<Uint8Array> },
                cb: (it: AsyncIterable<Uint8Array>) => void
            ) => {
                const metadata = this._metadata(hash, id);
                cb(metadata ? metadata.parseStream(iterator) : iterator);
            }
        );
    }

    subtitle(
        hash: string,
        id: number,
        cb: (subtitle: MatroskaSubtitle, trackNumber: string) => void
    ): void {
        const metadata = this._metadata(hash, id);
        if (!metadata) return;
        metadata.removeAllListeners('subtitle');
        metadata.on('subtitle', (sub: MatroskaSubtitle, trackNum: string | number) =>
            cb(sub, String(trackNum))
        );
    }

    async tracks(hash: string, id: number): Promise<TrackInfo[]> {
        await this.portReady;
        const metadata = this._metadata(hash, id);
        if (!metadata) return [];

        const [rawTracks, attachments] = await Promise.all([
            metadata.getTracks(),
            metadata.getAttachments(),
        ]);

        const fontUrls = attachments.map(
            (_: MatroskaAttachment, index: number) =>
                `http://127.0.0.1:${this.port}/${hash}${id}/${index}`
        );

        const result = rawTracks
            .filter((t) => SUBTITLE_TYPES.has(t.type?.toLowerCase()))
            .map((track) => {
                const format: 'ass' | 'vtt' =
                    track.type === 'ass' || track.type === 'ssa' ? 'ass' : 'vtt';
                return {
                    trackNumber: String(track.number),
                    lang: normalizeLang(track.language),
                    label: trackLabel(track),
                    format,
                    header: format === 'ass' ? buildAssHeader(track.header) : 'WEBVTT',
                    fonts: format === 'ass' ? fontUrls : [],
                };
            });

        log.debug('Tracks found:', result.length);
        return result;
    }

    async destroy(): Promise<void> {
        this.filemap.clear();
        this.metadatamap.clear();
        await new Promise((resolve) => this.server.close(resolve));
    }
}

export default new Attachments();
