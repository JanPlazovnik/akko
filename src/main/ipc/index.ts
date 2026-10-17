import { registerTorrentHandlers } from './torrent';
import { registerWindowHandlers } from './window';
import { registerExtensionHandlers } from './extensions';
import { registerSettingsHandlers } from './settings';

export function registerAllHandlers() {
    registerTorrentHandlers();
    registerWindowHandlers();
    registerExtensionHandlers();
    registerSettingsHandlers();
}
