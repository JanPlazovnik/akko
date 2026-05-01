import { registerTorrentHandlers } from './torrent';
import { registerWindowHandlers } from './window';
import { registerExtensionHandlers } from './extensions';

export function registerAllHandlers() {
    registerTorrentHandlers();
    registerWindowHandlers();
    registerExtensionHandlers();
}
