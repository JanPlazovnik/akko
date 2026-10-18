import { registerTorrentHandlers } from './torrent';
import { registerWindowHandlers } from './window';
import { registerExtensionHandlers } from './extensions';
import { registerSettingsHandlers } from './settings';
import { registerMetadataHandlers } from './metadata';
import { registerAccountHandlers } from './accounts';

export function registerAllHandlers() {
    registerTorrentHandlers();
    registerWindowHandlers();
    registerExtensionHandlers();
    registerSettingsHandlers();
    registerMetadataHandlers();
    registerAccountHandlers();
}
