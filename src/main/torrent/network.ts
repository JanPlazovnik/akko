import dgram from 'node:dgram';

const TRACKERS: [host: string, port: number][] = [
    ['tracker.opentrackr.org', 1337],
    ['open.stealth.si', 80],
    ['tracker.torrent.eu.org', 451],
];
const PROTOCOL_ID = 0x41727101980n;
const TRACKER_TIMEOUT_MS = 5000;

// BEP 15 connect request: any valid reply proves UDP reaches the tracker and back
function probeTracker(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        const transactionId = Math.floor(Math.random() * 2 ** 32);
        let settled = false;
        const done = (ok: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.close();
            resolve(ok);
        };
        const timer = setTimeout(() => done(false), TRACKER_TIMEOUT_MS);
        socket.on('message', (msg) =>
            done(
                msg.length >= 16 &&
                    msg.readUInt32BE(0) === 0 &&
                    msg.readUInt32BE(4) === transactionId
            )
        );
        socket.on('error', () => done(false));

        const request = Buffer.alloc(16);
        request.writeBigUInt64BE(PROTOCOL_ID, 0);
        request.writeUInt32BE(0, 8);
        request.writeUInt32BE(transactionId, 12);
        socket.send(request, port, host);
    });
}

export async function probeTrackers(): Promise<{ reached: number; total: number }> {
    const results = await Promise.all(TRACKERS.map(([host, port]) => probeTracker(host, port)));
    return { reached: results.filter(Boolean).length, total: TRACKERS.length };
}
