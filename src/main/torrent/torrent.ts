import { createStreamServer } from './stream';

let client: any = null;

async function getClient() {
    if (!client) {
        const WebTorrent = (await import('webtorrent')).default;
        client = new WebTorrent();
    }
    return client;
}

export async function startTorrent(magnetUri: string) {
    const wt = await getClient();
    wt.add(magnetUri, { destroyStoreOnDestroy: true }, async (torrent: any) => {
        console.log(torrent.files.map((f: any) => ({ name: f.name, length: f.length })));
        const streamUrl = await createStreamServer(torrent);
        console.log({ streamUrl });
    });
}
