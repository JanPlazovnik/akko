declare module 'webtorrent' {
    import { Readable } from 'stream';
    import { EventEmitter } from 'events';

    export interface TorrentFile extends EventEmitter {
        name: string;
        path: string;
        length: number;
        offset?: number;
        streamURL: string;
        _client?: WebTorrent;
        select(priority?: number): void;
        deselect(): void;
        createReadStream(opts?: { start?: number; end?: number }): Readable;
        [Symbol.asyncIterator](opts?: {
            start?: number;
            end?: number;
        }): AsyncIterableIterator<Uint8Array>;
    }

    export interface TorrentOptions {
        destroyStoreOnDestroy?: boolean;
        deselect?: boolean;
        path?: string;
        maxConns?: number;
    }

    export interface Torrent extends EventEmitter {
        infoHash: string;
        name: string;
        length: number;
        downloaded: number;
        uploaded: number;
        downloadSpeed: number;
        uploadSpeed: number;
        progress: number;
        ratio: number;
        numPeers: number;
        files: TorrentFile[];
        client?: WebTorrent;
        _client?: WebTorrent;
        pieces: (boolean | null)[];
        done: boolean;
        destroyed: boolean;
        destroy(opts?: { destroyStore?: boolean }, cb?: (err?: Error) => void): void;
        select(start: number, end: number, priority?: number): void;
        deselect(start: number, end: number, priority?: number): void;
    }

    export interface TorrentServer {
        pathname: string;
        address(): { address: string; family: string; port: number };
        listen(port?: number, hostname?: string, cb?: () => void): void;
        close(cb?: () => void): void;
    }

    export interface WebTorrentOptions {
        maxConns?: number;
        nodeId?: string;
        peerId?: string;
        tracker?: boolean | object;
        dht?: boolean | object;
        lsd?: boolean;
        webSeeds?: boolean;
        utp?: boolean;
        downloadLimit?: number;
        uploadLimit?: number;
    }

    class WebTorrent {
        constructor(opts?: WebTorrentOptions);
        torrents: Torrent[];
        downloadSpeed: number;
        uploadSpeed: number;
        ratio: number;
        add(magnet: string, cb?: (torrent: Torrent) => void): Torrent;
        add(magnet: string, opts: TorrentOptions, cb?: (torrent: Torrent) => void): Torrent;
        createServer(opts?: {
            origin?: string;
            pathname?: string;
            hostname?: string;
        }): TorrentServer;
        remove(
            torrentId: string,
            opts?: { destroyStore?: boolean },
            cb?: (err?: Error) => void
        ): void;
        destroy(cb?: (err?: Error) => void): void;
        get(torrentId: string): Torrent | null;
        on(event: 'error', cb: (err: Error) => void): this;
        on(event: 'torrent', cb: (torrent: Torrent) => void): this;
    }

    export default WebTorrent;
}
