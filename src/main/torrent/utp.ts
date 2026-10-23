import type { EventEmitter } from 'node:events';

interface UTPConnection extends EventEmitter {
    destroy(err?: Error): void;
}

interface UTPModule {
    new (opts?: unknown): EventEmitter & {
        connect(port: number, host: string): UTPConnection;
        close(): void;
    };
    connect(port: number, host: string, opts?: unknown): UTPConnection;
}

// Each outgoing uTP connection binds its own UDP socket, and a failed bind (e.g. ENOBUFS when
// Windows runs out of socket buffers) is emitted on that socket, which nobody listens to
export async function guardUtpConnect() {
    let UTP: UTPModule;
    try {
        UTP = (await import('utp-native')).default as UTPModule;
    } catch {
        return;
    }
    UTP.connect = (port, host, opts) => {
        const socket = new UTP(opts);
        const conn = socket.connect(port, host);
        socket.on('error', (err: Error) => conn.destroy(err));
        conn.on('close', () => socket.close());
        return conn;
    };
}
