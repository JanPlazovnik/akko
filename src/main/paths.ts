import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { AppSettings } from '../shared/ipc/api';
import { createLogger } from './logger';

const log = createLogger('paths');

// Not os.tmpdir(): on Linux that is often a RAM-backed tmpfs
export function defaultDownloadPath(): string {
    const home = os.homedir();
    if (process.platform === 'win32') {
        const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        return path.join(local, 'akko', 'downloads');
    }
    if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'akko');
    return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'akko');
}

export async function removeLegacyDownloads(settings: AppSettings) {
    const legacy = path.join(app.getPath('temp'), 'akko');
    if (settings.downloadPath && path.resolve(settings.downloadPath) === legacy) return;
    if (settings.keepFiles) {
        log.info(`Kept episodes from older versions may still be in ${legacy}`);
        return;
    }
    await rm(legacy, { recursive: true, force: true });
}
