import http from 'http';
import { Torrent } from 'webtorrent';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];

export async function createStreamServer(
    torrent: Torrent
): Promise<{ server: http.Server; streamUrl: string }> {
    return new Promise((resolve, reject) => {
        const file = torrent.files
            .filter((f: any) => VIDEO_EXTENSIONS.some((ext) => f.name.endsWith(ext)))
            .sort((a: any, b: any) => b.length - a.length)[0];

        if (!file) {
            console.error('[DEBUG] No video file found in torrent');
            reject(new Error('No video file found in torrent'));
            return;
        }

        console.log('[DEBUG] Selected video file:', file.name, `(${file.length} bytes)`);

        const server = http.createServer((req, res) => {
            const fileSize = file.length;
            const range = req.headers.range;
            console.log(`[DEBUG] Stream request — range: ${range ?? 'none'}`);

            if (range) {
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
                console.log(`[DEBUG] Serving range bytes ${start}-${end}/${fileSize}`);

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                    'Content-Type': 'video/mp4',
                });

                file.createReadStream({ start, end })
                    .on('error', (e) => console.error('[DEBUG] Stream error:', e))
                    .pipe(res);
            } else {
                console.log(`[DEBUG] Serving full file (${fileSize} bytes)`);
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4',
                });
                file.createReadStream()
                    .on('error', (e) => console.error('[DEBUG] Stream error:', e))
                    .pipe(res);
            }
        });

        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            console.log('[DEBUG] Stream server listening on port', port);
            resolve({ server, streamUrl: `http://localhost:${port}` });
        });
    });
}
