import { registerTorrentHandlers } from './torrent';
import { registerWindowHandlers } from './window';
import { registerExtensionHandlers } from './extensions';
import { registerSettingsHandlers } from './settings';
import { registerMetadataHandlers } from './metadata';
import { registerAccountHandlers } from './accounts';
import { registerAppHandlers } from './app';
import { registerProgressHandlers } from './progress';

export function registerAllHandlers() {
    registerAppHandlers();
    registerTorrentHandlers();
    registerWindowHandlers();
    registerExtensionHandlers();
    registerSettingsHandlers();
    registerMetadataHandlers();
    registerAccountHandlers();
    registerProgressHandlers();
}
