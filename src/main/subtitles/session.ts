import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { TorrentFile } from 'webtorrent';
import type { AudioTrack, SubtitleBatch, SubtitleTrack } from '../../shared/ipc/api';
import { dialogueLine, type SubtitleEvent } from '../../shared/subtitles';
import { sendToRenderer } from '../context';
import { createLogger } from '../logger';
import { audioTracks } from '../media/audio';
import { describeLanguage } from '../media/language';
import { t } from '../i18n';
import {
    isTextSubtitle,
    MatroskaFile,
    type MatroskaAttachment,
    type MatroskaTrack,
} from '../media/matroska';
import { assEvent, assHeader, parseTextSubtitles, plainEvent, PLAIN_HEADER } from './format';

const log = createLogger('subtitles');

const FLUSH_MS = 250;
const MATROSKA_EXTS = new Set(['.mkv', '.webm']);
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

function isAss(track: MatroskaTrack): boolean {
    return /^S_TEXT\/(ASS|SSA)$/i.test(track.codecId);
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

    private matroska: MatroskaFile | null = null;
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
        const matroska = await MatroskaFile.open(this.video, (track, cue) =>
            this.add(`mkv:${track.number}`, isAss(track) ? assEvent(cue) : plainEvent(cue))
        );
        this.matroska = matroska;
        this.audioTracks = audioTracks(matroska.tracks);

        this.onIterator = ({ iterator, req }, transform) => {
            this.scanFrom(matroska, rangeStart(req));
            transform(matroska.parseStream(iterator));
        };
        this.video.on('iterator', this.onIterator);

        matroska
            .attachments()
            .then((attachments) => {
                const fonts = attachments.filter(isFont).map((a) => a.data);
                if (fonts.length > 0 && !this.destroyed) {
                    sendToRenderer('stream:fonts', this.torrentId, fonts);
                }
            })
            .catch((err) => log.warn('Failed to read attachments:', err));

        matroska
            .chapters()
            .then((chapters) => {
                if (chapters.length === 0 || this.destroyed) return;
                const seconds = chapters.map((c) => ({
                    ...c,
                    start: c.start / 1000,
                    end: c.end / 1000,
                }));
                sendToRenderer('stream:chapters', this.torrentId, seconds);
            })
            .catch((err) => log.warn('Failed to read chapters:', err));

        return matroska.tracks.filter(isTextSubtitle).map((track) => ({
            id: `mkv:${track.number}`,
            ...describeLanguage(
                track.language,
                track.name,
                t('tracks.fallback', { n: track.number })
            ),
            header: isAss(track)
                ? assHeader(track.codecPrivate && Buffer.from(track.codecPrivate).toString())
                : PLAIN_HEADER,
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

    private scanFrom(matroska: MatroskaFile, offset: number) {
        if (this.scan && offset >= this.scan.start && offset <= this.scan.end) return;
        const scan = { start: offset, end: Math.min(offset + SCAN_BYTES, this.video.length) - 1 };
        this.scan = scan;
        this.runScan(matroska, scan).catch((err) => log.warn('Subtitle scan failed:', err));
    }

    private async runScan(matroska: MatroskaFile, scan: { start: number; end: number }) {
        const chunks = this.video[Symbol.asyncIterator]({ start: scan.start, end: scan.end });
        const parser = matroska.parseStream(chunks);
        try {
            while (this.scan === scan && !this.destroyed) {
                if ((await parser.next()).done) return;
            }
        } finally {
            await parser.return(undefined);
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
        this.matroska?.destroy();
    }
}
