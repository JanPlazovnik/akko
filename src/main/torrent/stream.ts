import http from 'http';
import path from 'path';
import { Torrent } from 'webtorrent';

const MIME_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mkv': 'video/mp4',
    '.avi': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/mp4',
};

export async function createStreamServer(
    torrent: Torrent
): Promise<{ server: http.Server; streamUrl: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const file = torrent.files
            .filter((f: any) => Object.keys(MIME_TYPES).some((ext) => f.name.endsWith(ext)))
            .sort((a: any, b: any) => b.length - a.length)[0];

        if (!file) {
            console.error('[DEBUG] No video file found in torrent');
            reject(new Error('No video file found in torrent'));
            return;
        }

        const ext = path.extname(file.name).toLowerCase();
        const mimeType = MIME_TYPES[ext] ?? 'video/mp4';

        console.log('[DEBUG] Selected video file:', file.name, `(${file.length} bytes)`, mimeType);

        const server = http.createServer((req, res) => {
            const fileSize = file.length;
            const range = req.headers.range;
            console.log(`[DEBUG] Stream request — range: ${range ?? 'none'}`);

            if (range) {
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = Math.min(endStr ? parseInt(endStr, 10) : fileSize - 1, fileSize - 1);
                console.log(`[DEBUG] Serving range bytes ${start}-${end}/${fileSize}`);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': mimeType,
                    'Access-Control-Allow-Origin': '*',
                });

                file.createReadStream({ start, end })
                    .on('error', (e) => console.error('[DEBUG] Stream error:', e))
                    .pipe(res);
            } else {
                console.log(`[DEBUG] Serving full file (${fileSize} bytes)`);
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': mimeType,
                    'Accept-Ranges': 'bytes',
                    'Access-Control-Allow-Origin': '*',
                });
                file.createReadStream()
                    .on('error', (e) => console.error('[DEBUG] Stream error:', e))
                    .pipe(res);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            console.log('[DEBUG] Stream server listening on port', port);
            resolve({ server, streamUrl: `http://localhost:${port}`, mimeType });
        });
    });
}
