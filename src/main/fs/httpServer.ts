import http from 'http';
import { TorrentFile } from './TorrentFile';

/**
 * HTTP range server backed by TorrentFile.
 *
 * Small range requests (metadata, MKV headers, cue tables) are served via
 * TorrentFile.read() which caches results - so ffmpeg's repeated seeks into
 * the same regions are served instantly from memory after first download.
 *
 * Large range requests (video playback) are streamed directly to avoid
 * buffering gigabytes in memory.
 */
const BUFFER_THRESHOLD = 2 * 1024 * 1024; // 2 MB

export function createRangeServer(
    torrentFile: TorrentFile,
    mimeType: string
): Promise<{ server: http.Server; url: string }> {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const fileSize = torrentFile.length;
        const range = req.headers.range;

        let start = 0;
        let end = fileSize - 1;
        let isRange = false;

        if (range) {
            const match = range.replace(/bytes=/, '').split('-');
            start = parseInt(match[0], 10);
            end = match[1] ? Math.min(parseInt(match[1], 10), fileSize - 1) : fileSize - 1;
            isRange = true;
        }

        const length = end - start + 1;
        const headers: Record<string, string | number> = {
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Length': length,
        };
        if (isRange) {
            headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
        }

        res.writeHead(isRange ? 206 : 200, headers);

        if (req.method === 'HEAD') {
            res.end();
            return;
        }

        if (length > BUFFER_THRESHOLD) {
            // Stream large ranges (video player seeking through the file)
            const stream = torrentFile.createReadStream({ start, end });
            res.on('close', () => stream.destroy());
            stream.on('error', () => {});
            stream.pipe(res);
        } else {
            // Buffer small ranges (ffmpeg metadata probes, cue seeks, subtitle packets)
            try {
                const buf = await torrentFile.read(start, length);
                res.end(buf);
            } catch {
                res.destroy();
            }
        }
    });

    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            resolve({ server, url: `http://127.0.0.1:${port}/` });
        });
    });
}
