import { Readable } from 'stream';

/**
 * Virtual random-access file backed by a webtorrent file object.
 *
 * Provides read(offset, length) semantics: maps byte ranges to torrent
 * pieces and waits only for the required pieces. Small reads (metadata,
 * MKV headers, cue tables) are cached so repeated ffmpeg seeks don't
 * re-download the same pieces.
 */
export class TorrentFile {
    private readonly file: any;
    // Cache small reads - key: "offset:length", value: Buffer
    private readonly cache = new Map<string, Buffer>();
    // Deduplicate in-flight reads for the same range
    private readonly inflight = new Map<string, Promise<Buffer>>();

    private static readonly CACHE_THRESHOLD = 512 * 1024; // 512 KB

    constructor(file: any) {
        this.file = file;
    }

    get length(): number {
        return this.file.length;
    }

    get name(): string {
        return this.file.name;
    }

    /**
     * Read [offset, offset+length) from the torrent file.
     * Waits only for the pieces that cover this byte range.
     */
    read(offset: number, length: number): Promise<Buffer> {
        const clampedEnd = Math.min(offset + length - 1, this.file.length - 1);
        const clampedLen = clampedEnd - offset + 1;

        if (clampedLen <= 0) return Promise.resolve(Buffer.alloc(0));

        const key = `${offset}:${clampedLen}`;

        const cached = this.cache.get(key);
        if (cached) return Promise.resolve(cached);

        const pending = this.inflight.get(key);
        if (pending) return pending;

        const promise = this._read(offset, clampedEnd, clampedLen, key);
        this.inflight.set(key, promise);
        return promise;
    }

    private _read(start: number, end: number, length: number, key: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            const stream: Readable = this.file.createReadStream({ start, end });
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => {
                const buf = Buffer.concat(chunks);
                this.inflight.delete(key);
                if (length <= TorrentFile.CACHE_THRESHOLD) {
                    this.cache.set(key, buf);
                }
                resolve(buf);
            });
            stream.on('error', (err: Error) => {
                this.inflight.delete(key);
                reject(err);
            });
        });
    }

    /** Stream a byte range - use for large ranges (video playback) to avoid buffering GBs. */
    createReadStream(opts?: { start?: number; end?: number }): Readable {
        return this.file.createReadStream(opts);
    }
}
