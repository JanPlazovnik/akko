import { createServer, type Server } from 'http';
import path from 'path';
import Metadata from 'matroska-metadata';

type IncomingSubtitleTrack = {
    lang: string;
    label: string;
    content: string;
    format?: 'vtt' | 'ass';
    fonts?: string[];
};

type SidecarSubtitleTrack = {
    lang: string;
    label: string;
    content: string;
    format: 'vtt';
};

type SubtitleEvent = {
    text: string;
    time: number;
    duration: number;
    readOrder?: string;
    layer?: string;
    style?: string;
    name?: string;
    marginL?: string;
    marginR?: string;
    marginV?: string;
    effect?: string;
};

type MetadataTrack = {
    number: string;
    language?: string;
    type: string;
    name?: string;
    header?: string;
};

type MetadataAttachment = {
    filename: string;
    mimetype: string;
    data: Uint8Array;
};

type RuntimeTrack = {
    trackNumber: string;
    lang: string;
    label: string;
    type: string;
    format: 'vtt' | 'ass';
    header: string;
    content: string;
    cues: string[];
    cueKeys: Set<string>;
    fonts?: string[];
};

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

function logStream(...args: unknown[]) {
    console.log(`[stream ${new Date().toISOString()}]`, ...args);
}

function normalizeLang(lang?: string): string {
    const value = (lang || 'und').toLowerCase();
    return value.length >= 2 ? value.slice(0, 2) : 'und';
}

function trackLabel(track: MetadataTrack): string {
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

function assTime(ms: number): string {
    const totalCs = Math.max(0, Math.round(ms / 10));
    const hours = Math.floor(totalCs / 360000);
    const minutes = Math.floor((totalCs % 360000) / 6000);
    const seconds = Math.floor((totalCs % 6000) / 100);
    const centiseconds = totalCs % 100;
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

function vttTime(ms: number): string {
    const totalMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(totalMs / 3_600_000);
    const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
    const seconds = Math.floor((totalMs % 60_000) / 1_000);
    const milliseconds = totalMs % 1_000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

function buildAssDialogue(subtitle: SubtitleEvent): string {
    const end = subtitle.time + subtitle.duration;
    return `Dialogue: ${subtitle.layer || '0'},${assTime(subtitle.time)},${assTime(end)},${subtitle.style || 'Default'},${subtitle.name || ''},${subtitle.marginL || '0'},${subtitle.marginR || '0'},${subtitle.marginV || '0'},${subtitle.effect || ''},${subtitle.text || ''}`;
}

function buildVttCue(subtitle: SubtitleEvent): string {
    const end = subtitle.time + subtitle.duration;
    return `${vttTime(subtitle.time)} --> ${vttTime(end)}\n${subtitle.text || ''}`;
}

function createTrackState(track: MetadataTrack, fonts: string[]): RuntimeTrack {
    const format = track.type === 'ass' || track.type === 'ssa' ? 'ass' : 'vtt';
    const header = format === 'ass' ? buildAssHeader(track.header) : 'WEBVTT';
    return {
        trackNumber: String(track.number),
        lang: normalizeLang(track.language),
        label: trackLabel(track),
        type: track.type,
        format,
        header,
        content: header,
        cues: [],
        cueKeys: new Set<string>(),
        fonts: format === 'ass' ? fonts : undefined,
    };
}

function materializeTrack(track: RuntimeTrack): IncomingSubtitleTrack {
    return {
        lang: track.lang,
        label: track.label,
        format: track.format,
        content: track.content,
        fonts: track.fonts,
    };
}

function subtitleEventKey(subtitle: SubtitleEvent): string {
    return JSON.stringify([
        subtitle.time,
        subtitle.duration,
        subtitle.text || '',
        subtitle.readOrder || '',
        subtitle.layer || '',
        subtitle.style || '',
        subtitle.name || '',
        subtitle.marginL || '',
        subtitle.marginR || '',
        subtitle.marginV || '',
        subtitle.effect || '',
    ]);
}

async function listen(server: Server): Promise<number> {
    return await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            resolve((server.address() as { port: number }).port);
        });
    });
}

export class AttachmentSession {
    private readonly metadata: any;
    private readonly attachmentServer: Server;
    private readonly sidecarTracks: SidecarSubtitleTrack[];
    private readonly tracks = new Map<string, RuntimeTrack>();
    private readonly trackOrder: string[] = [];
    private readonly emitSubtitles: (tracks: IncomingSubtitleTrack[]) => void;
    private readonly file: any;
    private readonly hash: string;
    private readonly fileId: number;
    private readonly iteratorHandler: (
        event: { iterator: AsyncIterable<Uint8Array> },
        cb: (iterator: AsyncIterable<Uint8Array>) => void
    ) => void;
    private flushTimer: NodeJS.Timeout | null = null;
    private destroyed = false;
    private emittedInitial = false;

    private constructor(
        file: any,
        hash: string,
        fileId: number,
        sidecarTracks: SidecarSubtitleTrack[],
        emitSubtitles: (tracks: IncomingSubtitleTrack[]) => void
    ) {
        this.file = file;
        this.hash = hash;
        this.fileId = fileId;
        this.sidecarTracks = sidecarTracks;
        this.emitSubtitles = emitSubtitles;
        this.metadata = new Metadata(file);
        this.attachmentServer = createServer(async (req, res) => {
            try {
                const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
                const [hashId, number] = pathname.split('/').slice(1);
                if (hashId !== `${this.hash}${this.fileId}` || !number) {
                    res.writeHead(404);
                    res.end();
                    return;
                }

                const attachment = (await this.metadata.getAttachments())[Number(number)] as
                    | MetadataAttachment
                    | undefined;
                if (!attachment) {
                    res.writeHead(404);
                    res.end();
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': attachment.mimetype || 'application/x-truetype-font',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'Content-Length': attachment.data.byteLength,
                });
                res.end(Buffer.from(attachment.data));
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(
                    JSON.stringify({
                        error: error instanceof Error ? error.message : String(error),
                    })
                );
            }
        });

        this.iteratorHandler = ({ iterator }, cb) => {
            if (this.destroyed) {
                cb(iterator);
                return;
            }
            cb(this.metadata.parseStream(iterator));
        };
    }

    static async create(
        file: any,
        hash: string,
        fileId: number,
        sidecarTracks: SidecarSubtitleTrack[],
        emitSubtitles: (tracks: IncomingSubtitleTrack[]) => void
    ): Promise<AttachmentSession> {
        const session = new AttachmentSession(file, hash, fileId, sidecarTracks, emitSubtitles);
        await session.initialize();
        return session;
    }

    private async initialize(): Promise<void> {
        const port = await listen(this.attachmentServer);
        this.file.on('iterator', this.iteratorHandler);

        const metadataTracks = (await this.metadata.getTracks()) as MetadataTrack[];
        logStream('Embedded subtitle streams found:', metadataTracks.length);

        const attachments = (await this.metadata.getAttachments()) as MetadataAttachment[];
        const fontUrls = attachments.map(
            (_attachment, index) => `http://127.0.0.1:${port}/${this.hash}${this.fileId}/${index}`
        );

        for (const track of metadataTracks) {
            const state = createTrackState(track, fontUrls);
            this.tracks.set(state.trackNumber, state);
            this.trackOrder.push(state.trackNumber);
        }

        if (attachments.length > 0) {
            logStream('Font attachments ready:', attachments.length);
        }

        this.metadata.on('subtitle', (subtitle: SubtitleEvent, trackNumber: string | number) => {
            const state = this.tracks.get(String(trackNumber));
            if (!state) return;

            const cueKey = subtitleEventKey(subtitle);
            if (state.cueKeys.has(cueKey)) return;
            state.cueKeys.add(cueKey);

            const cue = state.format === 'ass' ? buildAssDialogue(subtitle) : buildVttCue(subtitle);
            state.cues.push(cue);
            state.content = `${state.header}\n${state.cues.join('\n')}`;
            this.scheduleFlush();
        });

        this.flushNow();
    }

    private scheduleFlush() {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            this.flushNow();
        }, 250);
    }

    private flushNow() {
        if (this.destroyed) return;
        const tracks = [
            ...this.sidecarTracks,
            ...this.trackOrder
                .map((trackNumber) => this.tracks.get(trackNumber))
                .filter((track): track is RuntimeTrack => track !== undefined)
                .map(materializeTrack),
        ];
        this.emitSubtitles(tracks);
        if (!this.emittedInitial) {
            this.emittedInitial = true;
            logStream(
                'Subtitles ready:',
                tracks.map((track) => `${track.label}(${track.lang})`)
            );
        }
    }

    async close(): Promise<void> {
        this.destroyed = true;
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.metadata.destroy?.();
        this.metadata.removeAllListeners?.();
        this.file.off?.('iterator', this.iteratorHandler);
        await new Promise((resolve) => this.attachmentServer.close(resolve));
    }
}

export function detectLang(filename: string): { lang: string; label: string } {
    const base = path.basename(filename, path.extname(filename)).toLowerCase();
    for (const part of base.split(/[.\-_ \[\]()]/).reverse()) {
        if (LANG_MAP[part]) return { lang: part.slice(0, 2), label: LANG_MAP[part] };
    }
    return { lang: 'und', label: path.basename(filename, path.extname(filename)) };
}
