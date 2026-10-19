import { app, ipcMain } from 'electron';
import os from 'node:os';
import type { AppInfo } from '../../shared/ipc/api';

const PLATFORMS: Record<string, string> = { win32: 'Windows', linux: 'Linux', darwin: 'macOS' };

export function registerAppHandlers() {
    ipcMain.handle(
        'app:info',
        (): AppInfo => ({
            version: app.getVersion(),
            commit: __COMMIT__,
            platform: process.env.APPIMAGE
                ? 'Linux AppImage'
                : (PLATFORMS[process.platform] ?? process.platform),
            arch: process.arch,
            os: os.release(),
            electron: process.versions.electron,
            chrome: process.versions.chrome,
        })
    );
}
