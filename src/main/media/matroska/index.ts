import { inflateSync } from 'node:zlib';
import { createLogger } from '../../logger';
import { child, children, float, readHeader, readVint, text, uint, UNKNOWN_SIZE } from './ebml';

const log = createLogger('matroska');

const ID = {
    EBML: 0x1a45dfa3,
    Segment: 0x18538067,
    SeekHead: 0x114d9b74,
    Seek: 0x4dbb,
    SeekID: 0x53ab,
    SeekPosition: 0x53ac,
    Info: 0x1549a966,
    TimestampScale: 0x2ad7b1,
    Duration: 0x4489,
    Tracks: 0x1654ae6b,
    TrackEntry: 0xae,
    TrackNumber: 0xd7,
    TrackType: 0x83,
    CodecID: 0x86,
    CodecPrivate: 0x63a2,
    Language: 0x22b59c,
    LanguageBCP47: 0x22b59d,
    Name: 0x536e,
    Audio: 0xe1,
    Channels: 0x9f,
    ContentEncodings: 0x6d80,
    ContentEncoding: 0x6240,
    ContentEncodingScope: 0x5032,
    ContentCompression: 0x5034,
    ContentCompAlgo: 0x4254,
    ContentCompSettings: 0x4255,
    Attachments: 0x1941a469,
    AttachedFile: 0x61a7,
    FileName: 0x466e,
    FileMimeType: 0x4660,
    FileData: 0x465c,
    Chapters: 0x1043a770,
    EditionEntry: 0x45b9,
    EditionFlagDefault: 0x45db,
    ChapterAtom: 0xb6,
    ChapterTimeStart: 0x91,
    ChapterTimeEnd: 0x92,
    ChapterFlagHidden: 0x98,
    ChapterFlagEnabled: 0x4598,
    ChapterDisplay: 0x80,
    ChapString: 0x85,
    Cluster: 0x1f43b675,
    Timestamp: 0xe7,
    BlockGroup: 0xa0,
    Block: 0xa1,
    BlockDuration: 0x9b,
    CRC32: 0xbf,
    Void: 0xec,
};

export const TrackType = { Video: 1, Audio: 2, Subtitle: 0x11 };

const HEAD_BYTES = 64 * 1024;
const MAX_ELEMENT = 16 * 1024 * 1024;
const CLUSTER_FIRST = new Set([ID.Timestamp, ID.CRC32, ID.Void]);

export type ByteSource = {
    length: number;
    [Symbol.asyncIterator](opts?: { start?: number; end?: number }): AsyncIterator<Uint8Array>;
};

export type MatroskaTrack = {
    number: number;
    type: number;
    codecId: string;
    language: string;
    name?: string;
    codecPrivate?: Uint8Array;
    channels?: number;
};

export type MatroskaAttachment = { filename: string; mimetype: string; data: Uint8Array };
export type MatroskaCue = { time: number; duration: number; text: string };
export type MatroskaChapter = { start: number; end: number; title: string };
export type SubtitleHandler = (track: MatroskaTrack, cue: MatroskaCue) => void;

type Decode = (data: Uint8Array) => Uint8Array;

const decoder = new TextDecoder();

export function isTextSubtitle(track: MatroskaTrack): boolean {
    return track.type === TrackType.Subtitle && track.codecId.startsWith('S_TEXT/');
}

async function read(source: ByteSource, start: number, length: number): Promise<Uint8Array> {
    const end = Math.min(start + length, source.length);
    if (end <= start) return new Uint8Array(0);
    const iterator = source[Symbol.asyncIterator]({ start, end: end - 1 });
    const chunks: Uint8Array[] = [];
    for (let r = await iterator.next(); !r.done; r = await iterator.next()) chunks.push(r.value);
    return Buffer.concat(chunks);
}

async function readElement(source: ByteSource, pos: number): Promise<Uint8Array | undefined> {
    const header = readHeader(await read(source, pos, 12), 0);
    if (!header || header.size === UNKNOWN_SIZE) return undefined;
    return read(source, pos + header.length, header.size);
}

function readAt(
    source: ByteSource,
    positions: Map<number, number>,
    id: number
): Promise<Uint8Array | undefined> {
    const pos = positions.get(id);
    return pos === undefined ? Promise.resolve(undefined) : readElement(source, pos);
}

async function locate(source: ByteSource): Promise<Map<number, number>> {
    const head = await read(source, 0, HEAD_BYTES);
    const ebml = readHeader(head, 0);
    if (ebml?.id !== ID.EBML) throw new Error('Not a Matroska file');
    const segment = readHeader(head, ebml.length + ebml.size);
    if (segment?.id !== ID.Segment) throw new Error('Missing Matroska segment');
    const segmentStart = ebml.length + ebml.size + segment.length;

    const positions = new Map<number, number>();
    for (let pos = segmentStart; pos < source.length; ) {
        const header =
            pos + 12 <= head.length
                ? readHeader(head, pos)
                : readHeader(await read(source, pos, 12), 0);
        if (!header) break;
        if (!positions.has(header.id)) positions.set(header.id, pos);
        if (header.id === ID.Cluster || header.size === UNKNOWN_SIZE) break;
        pos += header.length + header.size;
    }

    const seekHead = positions.get(ID.SeekHead);
    const seekHeads = seekHead === undefined ? [] : [seekHead];
    for (const pos of seekHeads) {
        for (const seek of children(await readElement(source, pos))) {
            if (seek.id !== ID.Seek) continue;
            const id = uint(child(seek.data, ID.SeekID));
            const position = uint(child(seek.data, ID.SeekPosition));
            if (id === undefined || position === undefined) continue;
            if (id === ID.SeekHead) {
                if (seekHeads.length < 4) seekHeads.push(segmentStart + position);
            } else if (!positions.has(id)) positions.set(id, segmentStart + position);
        }
    }
    return positions;
}

function contentDecoder(entry: Uint8Array): { decode: Decode; scope: number } | undefined {
    const encoding = child(child(entry, ID.ContentEncodings), ID.ContentEncoding);
    const compression = child(encoding, ID.ContentCompression);
    if (!compression) return undefined;
    const scope = uint(child(encoding, ID.ContentEncodingScope)) ?? 1;
    const algo = uint(child(compression, ID.ContentCompAlgo)) ?? 0;
    const settings = child(compression, ID.ContentCompSettings) ?? new Uint8Array(0);
    if (algo === 0) return { decode: (data) => inflateSync(data), scope };
    if (algo === 3) return { decode: (data) => Buffer.concat([settings, data]), scope };
    log.warn(`Unsupported content compression ${algo}`);
    return undefined;
}

function parseTracks(data: Uint8Array | undefined, decoders: Map<number, Decode>): MatroskaTrack[] {
    const tracks: MatroskaTrack[] = [];
    for (const { id, data: entry } of children(data)) {
        if (id !== ID.TrackEntry) continue;
        const number = uint(child(entry, ID.TrackNumber));
        if (number === undefined) continue;
        const content = contentDecoder(entry);
        let codecPrivate = child(entry, ID.CodecPrivate);
        if (codecPrivate && content && content.scope & 2)
            codecPrivate = content.decode(codecPrivate);
        if (content && content.scope & 1) decoders.set(number, content.decode);
        tracks.push({
            number,
            type: uint(child(entry, ID.TrackType)) ?? 0,
            codecId: text(child(entry, ID.CodecID)) ?? '',
            language:
                text(child(entry, ID.LanguageBCP47)) ?? text(child(entry, ID.Language)) ?? 'eng',
            name: text(child(entry, ID.Name)),
            codecPrivate,
            channels: uint(child(child(entry, ID.Audio), ID.Channels)),
        });
    }
    return tracks;
}

function parseChapters(data: Uint8Array | undefined, duration?: number): MatroskaChapter[] {
    const editions = [...children(data)].filter((e) => e.id === ID.EditionEntry).map((e) => e.data);
    const edition = editions.find((e) => uint(child(e, ID.EditionFlagDefault))) ?? editions[0];
    const atoms = [...children(edition)]
        .filter(({ id }) => id === ID.ChapterAtom)
        .map(({ data: atom }) => ({
            atom,
            start: (uint(child(atom, ID.ChapterTimeStart)) ?? 0) / 1e6,
        }))
        .filter(
            ({ atom }) =>
                !uint(child(atom, ID.ChapterFlagHidden)) &&
                (uint(child(atom, ID.ChapterFlagEnabled)) ?? 1)
        )
        .sort((a, b) => a.start - b.start);
    return atoms.map(({ atom, start }, i) => {
        const end = uint(child(atom, ID.ChapterTimeEnd));
        return {
            start,
            end: end !== undefined ? end / 1e6 : (atoms[i + 1]?.start ?? duration ?? start),
            title: text(child(child(atom, ID.ChapterDisplay), ID.ChapString)) ?? '',
        };
    });
}

function findCluster(buf: Uint8Array, from: number): { pos: number; found: boolean } {
    for (
        let i = buf.indexOf(0x1f, from);
        i >= 0 && i + 4 <= buf.length;
        i = buf.indexOf(0x1f, i + 1)
    ) {
        if (buf[i + 1] !== 0x43 || buf[i + 2] !== 0xb6 || buf[i + 3] !== 0x75) continue;
        const cluster = readHeader(buf, i);
        if (cluster === null) continue;
        const first = cluster && readHeader(buf, i + cluster.length);
        if (cluster === undefined || first === undefined) return { pos: i, found: false };
        if (first && CLUSTER_FIRST.has(first.id)) return { pos: i, found: true };
    }
    return { pos: Math.max(from, buf.length - 3), found: false };
}

class ClusterReader {
    private buf: Uint8Array = new Uint8Array(0);
    private skip = 0;
    private aligned = false;
    private clusterTime: number | null = null;

    constructor(
        private readonly file: MatroskaFile,
        private readonly onSubtitle: SubtitleHandler
    ) {}

    reset() {
        this.buf = new Uint8Array(0);
        this.skip = 0;
        this.aligned = false;
    }

    push(chunk: Uint8Array) {
        if (this.skip >= chunk.length) {
            this.skip -= chunk.length;
            return;
        }
        chunk = chunk.subarray(this.skip);
        this.skip = 0;
        const buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
        let pos = 0;
        while (pos < buf.length) {
            if (!this.aligned) {
                const cluster = findCluster(buf, pos);
                pos = cluster.pos;
                if (!cluster.found) break;
                this.aligned = true;
            }
            const header = readHeader(buf, pos);
            if (header === undefined) break;
            if (header?.id === ID.Cluster) {
                this.clusterTime = null;
                pos += header.length;
                continue;
            }
            if (!header || header.size === UNKNOWN_SIZE) {
                this.aligned = false;
                pos++;
                continue;
            }
            const start = pos + header.length;
            const end = start + header.size;
            if (header.id !== ID.Timestamp && header.id !== ID.BlockGroup) {
                if (end > buf.length) this.skip = end - buf.length;
                pos = Math.min(end, buf.length);
                continue;
            }
            if (header.size > MAX_ELEMENT) {
                this.aligned = false;
                pos++;
                continue;
            }
            if (end > buf.length) break;
            const data = buf.subarray(start, end);
            if (header.id === ID.Timestamp) this.clusterTime = uint(data) ?? null;
            else this.blockGroup(data);
            pos = end;
        }
        this.buf = buf.subarray(pos);
    }

    private blockGroup(group: Uint8Array) {
        const block = child(group, ID.Block);
        const track = block && readVint(block, 0);
        if (!track || this.clusterTime === null || block.length < track.length + 3) return;
        const matroskaTrack = this.file.textTracks.get(track.value);
        if (!matroskaTrack || block[track.length + 2] & 0x06) return;

        const relative = Buffer.from(block.buffer, block.byteOffset, block.length).readInt16BE(
            track.length
        );
        const payload = block.subarray(track.length + 3);
        const decode = this.file.decoders.get(track.value);
        const scale = this.file.timestampScale;
        this.onSubtitle(matroskaTrack, {
            time: (this.clusterTime + relative) * scale,
            duration: (uint(child(group, ID.BlockDuration)) ?? 0) * scale,
            text: decoder.decode(decode ? decode(payload) : payload),
        });
    }
}

export class MatroskaFile {
    readonly textTracks: Map<number, MatroskaTrack>;
    readonly decoders = new Map<number, Decode>();
    readonly tracks: MatroskaTrack[];
    readonly timestampScale: number;
    private readonly duration?: number;
    private destroyed = false;

    private constructor(
        private readonly source: ByteSource,
        private readonly positions: Map<number, number>,
        private readonly onSubtitle: SubtitleHandler,
        info: Uint8Array | undefined,
        tracks: Uint8Array | undefined
    ) {
        this.timestampScale = (uint(child(info, ID.TimestampScale)) ?? 1e6) / 1e6;
        const duration = float(child(info, ID.Duration));
        if (duration !== undefined) this.duration = duration * this.timestampScale;
        this.tracks = parseTracks(tracks, this.decoders);
        this.textTracks = new Map(this.tracks.filter(isTextSubtitle).map((t) => [t.number, t]));
    }

    static async open(source: ByteSource, onSubtitle: SubtitleHandler): Promise<MatroskaFile> {
        const positions = await locate(source);
        const [info, tracks] = await Promise.all([
            readAt(source, positions, ID.Info),
            readAt(source, positions, ID.Tracks),
        ]);
        return new MatroskaFile(source, positions, onSubtitle, info, tracks);
    }

    async chapters(): Promise<MatroskaChapter[]> {
        return parseChapters(await readAt(this.source, this.positions, ID.Chapters), this.duration);
    }

    async attachments(): Promise<MatroskaAttachment[]> {
        const data = await readAt(this.source, this.positions, ID.Attachments);
        return [...children(data)]
            .filter(({ id }) => id === ID.AttachedFile)
            .map(({ data: file }) => ({
                filename: text(child(file, ID.FileName)) ?? '',
                mimetype: text(child(file, ID.FileMimeType)) ?? '',
                data: new Uint8Array(child(file, ID.FileData) ?? []),
            }));
    }

    async *parseStream(stream: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
        const reader = new ClusterReader(this, this.onSubtitle);
        for await (const chunk of stream) {
            if (!this.destroyed) {
                try {
                    reader.push(chunk);
                } catch (err) {
                    log.warn('Failed to parse cluster:', err);
                    reader.reset();
                }
            }
            yield chunk;
        }
    }

    destroy() {
        this.destroyed = true;
    }
}
