/// <reference types="vite/client" />
import { app, autoUpdater, BrowserWindow } from 'electron';
import icon from '../../assets/icon.svg?raw';
import { createLogger } from './logger';

const log = createLogger('updater');

const FEED_URL = 'https://github.com/JanPlazovnik/akko/releases/latest/download';
const CHECK_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 3 * 60_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const PAGE = `<!doctype html>
<html><head><meta charset="UTF-8"><style>
html, body { margin: 0; height: 100%; background: #07070a; overflow: hidden; }
body { display: grid; place-content: center; justify-items: center; gap: 22px;
    font: 500 12px system-ui, sans-serif; color: rgb(255 255 255 / 0.45); user-select: none;
    -webkit-app-region: drag; }
svg { width: 76px; height: 76px; }
</style></head><body>${icon}<p id="status">Checking for updates</p></body></html>`;

export type LaunchUpdate = { installing: true } | { installing: false; close: () => void };

// Squirrel installs updates on Windows only; AppImage and distro packages are updated by hand
const enabled = () => app.isPackaged && process.platform === 'win32';

// Like Discord: a small window checks for an update before the app opens, and installs it right
// away if there is one. Squirrel still holds its lock right after installing, so the first run skips it.
export async function updateOnLaunch(): Promise<LaunchUpdate> {
    const skipped: LaunchUpdate = { installing: false, close: () => undefined };
    if (!enabled()) return skipped;
    autoUpdater.setFeedURL({ url: FEED_URL });
    autoUpdater.on('error', (err) => log.warn('Update check failed:', err.message));
    if (process.argv.includes('--squirrel-firstrun')) return skipped;

    const window = new BrowserWindow({
        width: 280,
        height: 320,
        frame: false,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        backgroundColor: '#07070a',
        title: 'akko',
    });
    window.once('ready-to-show', () => window.show());
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
    const setStatus = (text: string) =>
        void window.webContents
            .executeJavaScript(
                `document.getElementById('status').textContent = ${JSON.stringify(text)}`
            )
            .catch(() => undefined);

    const installing = await new Promise<boolean>((resolve) => {
        let timer = setTimeout(() => finish(false), CHECK_TIMEOUT_MS);
        const available = () => {
            log.info('Downloading update');
            setStatus('Downloading update');
            clearTimeout(timer);
            timer = setTimeout(() => finish(false), DOWNLOAD_TIMEOUT_MS);
        };
        const downloaded = (_event: unknown, _notes: string, name: string) => {
            log.info(`Installing update ${name}`);
            setStatus('Installing update');
            finish(true);
        };
        const failed = () => finish(false);
        const notAvailable = () => finish(false);
        function finish(result: boolean) {
            clearTimeout(timer);
            autoUpdater.off('update-available', available);
            autoUpdater.off('update-downloaded', downloaded);
            autoUpdater.off('update-not-available', notAvailable);
            autoUpdater.off('error', failed);
            resolve(result);
        }
        autoUpdater.once('update-available', available);
        autoUpdater.once('update-downloaded', downloaded);
        autoUpdater.once('update-not-available', notAvailable);
        autoUpdater.once('error', failed);
        autoUpdater.checkForUpdates();
    });

    if (installing) {
        autoUpdater.quitAndInstall();
        return { installing: true };
    }
    return { installing: false, close: () => window.destroy() };
}

// Updates found while the app is open download quietly and apply on the next launch
export function checkPeriodically() {
    if (!enabled()) return;
    setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS).unref();
}
