import http from 'http';
import { TorrentFile } from './TorrentFile';

export type FontAttachment = {
    name: string;
    mediaType: string;
    data: Uint8Array;
};

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
const OPEN_ENDED_RANGE_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

export function createRangeServer(
    torrentFile: TorrentFile,
    mimeType: string,
    fontAttachments: FontAttachment[] = []
): Promise<{ server: http.Server; playbackUrl: string; sourceUrl: string; fontBaseUrl: string }> {
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
        const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
        const fontMatch = requestUrl.pathname.match(/^\/fonts\/(\d+)$/);
        if (fontMatch) {
            const font = fontAttachments[Number(fontMatch[1])];
            if (!font) {
                res.writeHead(404);
                res.end();
                return;
            }

            res.writeHead(200, {
                'Content-Type': font.mediaType || 'application/x-truetype-font',
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Content-Length': font.data.byteLength,
            });

            if (req.method === 'HEAD') {
                res.end();
                return;
            }

            res.end(Buffer.from(font.data));
            return;
        }

        const range = req.headers.range;
        const isPlaybackRequest = requestUrl.pathname === '/playback';

        let start = 0;
        let end = fileSize - 1;
        let isRange = false;

        if (range) {
            const match = range.replace(/bytes=/, '').split('-');
            start = parseInt(match[0], 10);

            if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`,
                });
                res.end();
                return;
            }

            if (match[1]) {
                end = Math.min(parseInt(match[1], 10), fileSize - 1);
            } else if (isPlaybackRequest) {
                // Browsers often request `bytes=0-` first. Serving the whole
                // remaining torrent here turns startup into a long sequential
                // download and starves random-access subtitle reads.
                end = Math.min(start + OPEN_ENDED_RANGE_CHUNK_SIZE - 1, fileSize - 1);
            }

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
            resolve({
                server,
                playbackUrl: `http://127.0.0.1:${port}/playback`,
                sourceUrl: `http://127.0.0.1:${port}/source`,
                fontBaseUrl: `http://127.0.0.1:${port}/fonts`,
            });
        });
    });
}
