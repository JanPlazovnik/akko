import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import Metadata from 'matroska-metadata';
import type { MatroskaAttachment, MatroskaSubtitle } from 'matroska-metadata';
import type { TorrentFile } from 'webtorrent';
import type { AudioTrack, SubtitleBatch, SubtitleTrack } from '../../shared/ipc/api';
import { dialogueLine, type SubtitleEvent } from '../../shared/subtitles';
import { sendToRenderer } from '../context';
import { createLogger } from '../logger';
import { readAudioTracks } from '../media/audio';
import { describeLanguage } from '../media/language';
import { assEvent, assHeader, parseTextSubtitles, plainEvent, PLAIN_HEADER } from './format';

const log = createLogger('subtitles');

const FLUSH_MS = 250;
const MATROSKA_EXTS = new Set(['.mkv', '.webm']);
const ASS_TYPES = new Set(['ass', 'ssa']);
const FONT_FILE = /\.(ttf|otf|ttc|woff2?)$/i;
const SCAN_BYTES = 8 * 1024 * 1024;

type IteratorEvent = { iterator: AsyncIterable<Uint8Array>; req: IncomingMessage };
type IteratorHandler = (
    event: IteratorEvent,
    transform: (iterator: AsyncIterable<Uint8Array>) => void
) => void;

function rangeStart(req: IncomingMessage): number {
    return Number(/bytes=(\d+)/.exec(req.headers.range ?? '')?.[1] ?? 0);
}

function stem(file: TorrentFile): string {
    return path.basename(file.name, path.extname(file.name));
}

function isFont(attachment: MatroskaAttachment): boolean {
    return FONT_FILE.test(attachment.filename) || /font|opentype/.test(attachment.mimetype);
}

function numberDuplicateLabels(tracks: SubtitleTrack[]): SubtitleTrack[] {
    const totals = new Map<string, number>();
    tracks.forEach((t) => totals.set(t.label, (totals.get(t.label) ?? 0) + 1));
    const counts = new Map<string, number>();
    return tracks.map((track) => {
        if (totals.get(track.label) === 1) return track;
        const n = (counts.get(track.label) ?? 0) + 1;
        counts.set(track.label, n);
        return { ...track, label: `${track.label} ${n}` };
    });
}

async function readText(file: TorrentFile): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of file) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

export class SubtitleSession {
    tracks: SubtitleTrack[] = [];
    audioTracks: AudioTrack[] = [];

    private metadata: Metadata | null = null;
    private onIterator: IteratorHandler | null = null;
    private scan: { start: number; end: number } | null = null;
    private seen = new Map<string, Set<string>>();
    private pending: SubtitleBatch = {};
    private timer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    private constructor(
        private readonly torrentId: string,
        private readonly video: TorrentFile
    ) {}

    static async open(
        torrentId: string,
        video: TorrentFile,
        sidecars: TorrentFile[]
    ): Promise<SubtitleSession> {
        const session = new SubtitleSession(torrentId, video);
        const embedded = MATROSKA_EXTS.has(path.extname(video.name).toLowerCase())
            ? await session.openEmbedded()
            : [];
        session.tracks = numberDuplicateLabels([
            ...embedded,
            ...sidecars.map((file, i) => session.openSidecar(file, `file:${i}`)),
        ]);
        log.debug(
            'Tracks:',
            session.tracks.map((t) => `${t.id} ${t.label} (${t.lang})`)
        );
        return session;
    }

    private async openEmbedded(): Promise<SubtitleTrack[]> {
        const metadata = new Metadata(this.video);
        this.metadata = metadata;

        const tracks = await metadata.getTracks();
        this.audioTracks = await readAudioTracks(metadata);
        const assTracks = new Set(
            tracks.filter((t) => ASS_TYPES.has(t.type)).map((t) => String(t.number))
        );

        metadata.on('subtitle', (sub: MatroskaSubtitle, number: string | number) => {
            const id = String(number);
            this.add(`mkv:${id}`, assTracks.has(id) ? assEvent(sub) : plainEvent(sub));
        });

        this.onIterator = ({ iterator, req }, transform) => {
            this.scanFrom(metadata, rangeStart(req));
            transform(metadata.parseStream(iterator));
        };
        this.video.on('iterator', this.onIterator);

        metadata
            .getAttachments()
            .then((attachments) => {
                const fonts = attachments.filter(isFont).map((a) => a.data);
                if (fonts.length > 0 && !this.destroyed) {
                    sendToRenderer('stream:fonts', this.torrentId, fonts);
                }
            })
            .catch((err) => log.warn('Failed to read attachments:', err));

        return tracks.map((track) => ({
            id: `mkv:${track.number}`,
            ...describeLanguage(track.language ?? 'eng', track.name, `Track ${track.number}`),
            header: assTracks.has(String(track.number)) ? assHeader(track.header) : PLAIN_HEADER,
        }));
    }

    private openSidecar(file: TorrentFile, id: string): SubtitleTrack {
        readText(file)
            .then((content) => {
                for (const cue of parseTextSubtitles(content)) this.add(id, plainEvent(cue));
            })
            .catch((err) => log.warn(`Failed to read ${file.name}:`, err));

        const code = stem(file).split('.').pop() ?? '';
        return { id, ...describeLanguage(code, undefined, stem(file)), header: PLAIN_HEADER };
    }

    private scanFrom(metadata: Metadata, offset: number) {
        if (this.scan && offset >= this.scan.start && offset <= this.scan.end) return;
        const scan = { start: offset, end: Math.min(offset + SCAN_BYTES, this.video.length) - 1 };
        this.scan = scan;
        this.runScan(metadata, scan).catch((err) => log.warn('Subtitle scan failed:', err));
    }

    private async runScan(metadata: Metadata, scan: { start: number; end: number }) {
        const chunks = this.video[Symbol.asyncIterator]({ start: scan.start, end: scan.end });
        const parser = metadata.parseStream(chunks)[Symbol.asyncIterator]();
        try {
            while (this.scan === scan && !this.destroyed) {
                if ((await parser.next()).done) return;
            }
        } finally {
            await parser.return?.();
        }
    }

    private add(trackId: string, event: SubtitleEvent) {
        let seen = this.seen.get(trackId);
        if (!seen) this.seen.set(trackId, (seen = new Set()));
        const key = dialogueLine(event);
        if (seen.has(key)) return;
        seen.add(key);

        (this.pending[trackId] ??= []).push(event);
        this.timer ??= setTimeout(() => this.flush(), FLUSH_MS);
    }

    private flush() {
        this.timer = null;
        if (this.destroyed) return;
        sendToRenderer('stream:subtitles', this.torrentId, this.pending);
        this.pending = {};
    }

    destroy() {
        this.destroyed = true;
        if (this.timer) clearTimeout(this.timer);
        if (this.onIterator) this.video.removeListener('iterator', this.onIterator);
        this.metadata?.destroy();
    }
}
