import http from 'http';

export async function createStreamServer(torrent: any): Promise<string> {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const videoExtensions = ['.mp4', '.mkv', '.avi', '.webm', '.mov']

            const file = torrent.files
                .filter((f: any) => videoExtensions.some(ext => f.name.endsWith(ext)))
                .sort((a: any, b: any) => b.length - a.length)[0]

            const fileSize = file.length;
            const range = req.headers.range;

            let stream;
            if (range) {
                const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
                const start = parseInt(startStr, 10);
                const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
                const chunkSize = end - start + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': 'video/mp4'
                });

                stream = file.createReadStream({ start, end });
            } else {
                res.writeHead(200, {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp4'
                });
                stream = file.createReadStream();
            }

            stream.on('error', () => { });
            stream.pipe(res);
        })

        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as any).port;
            resolve(`http://localhost:${port}`);
        })
    });
}