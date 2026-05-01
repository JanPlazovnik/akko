import { registerTorrentHandlers } from './torrent';
import { registerWindowHandlers } from './window';

export function registerAllHandlers() {
    registerTorrentHandlers();
    registerWindowHandlers();
}
