declare module 'webtorrent' {
    import { Readable } from 'stream';

    export interface TorrentFile {
        name: string;
        path: string;
        length: number;
        createReadStream(opts?: { start?: number; end?: number }): Readable;
    }

    export interface TorrentOptions {
        destroyStoreOnDestroy?: boolean;
        path?: string;
        maxConns?: number;
    }

    export interface Torrent {
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
        pieces: (boolean | null)[];
        done: boolean;
        on(event: 'ready', cb: () => void): this;
        on(event: 'error', cb: (err: Error) => void): this;
        on(event: 'done', cb: () => void): this;
        on(event: 'download', cb: (bytes: number) => void): this;
        on(event: 'upload', cb: (bytes: number) => void): this;
        remove(cb?: (err?: Error) => void): void;
        select(start: number, end: number, priority?: number): void;
        deselect(start: number, end: number, priority?: number): void;
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
