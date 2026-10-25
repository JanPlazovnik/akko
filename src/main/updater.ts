/// <reference types="vite/client" />
import { app, BrowserWindow } from 'electron';
import {
    HttpSource,
    UpdateManager,
    VelopackApp,
    type UpdateInfo,
    type VelopackAsset,
} from 'velopack';
import icon from '../../assets/icon.svg?raw';
import { createLogger } from './logger';

const log = createLogger('updater');

const FEED_URL = __UPDATE_FEED__;
const CHECK_TIMEOUT_MS = 10_000;
// Downloads only give up once progress stops coming
const STALL_TIMEOUT_MS = 60_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

const PAGE = `<!doctype html>
<html><head><meta charset="UTF-8"><style>
html, body { margin: 0; height: 100%; background: #07070a; overflow: hidden; }
body { display: grid; place-content: center; justify-items: center; gap: 14px;
    font: 500 12px system-ui, sans-serif; color: rgb(255 255 255 / 0.75); user-select: none;
    -webkit-app-region: drag; }
svg { width: 76px; height: 76px; margin-bottom: 8px; animation: bob 2.4s ease-in-out infinite; }
@keyframes bob { 50% { transform: translateY(-4px); } }
p { margin: 0; }
#detail { height: 14px; font-size: 11px; color: rgb(255 255 255 / 0.35);
    font-variant-numeric: tabular-nums; }
.track { position: relative; width: 160px; height: 4px; border-radius: 2px; overflow: hidden;
    background: rgb(255 255 255 / 0.08); }
.fill { height: 100%; width: 0; border-radius: 2px; transition: width 0.3s ease;
    background: linear-gradient(90deg, rgb(185 166 255 / 0.4), #b9a6ff, #d9ceff); }
.busy .fill { position: absolute; width: 35%; animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { from { left: -35%; } to { left: 100%; } }
</style></head><body>
${icon}
<p id="status">Checking for updates</p>
<div id="track" class="track busy"><div id="fill" class="fill"></div></div>
<p id="detail"></p>
<script>
window.setState = ({ status, progress }) => {
    document.getElementById('status').textContent = status;
    const known = typeof progress === 'number';
    document.getElementById('track').classList.toggle('busy', !known);
    document.getElementById('fill').style.width = known ? progress + '%' : '';
    document.getElementById('detail').textContent = known ? Math.round(progress) + '%' : '';
};
</script>
</body></html>`;

export type LaunchUpdate = { installing: true } | { installing: false; close: () => void };
type UpdateState = { status: string; progress?: number };

// Velopack installs updates on Windows only; AppImage and distro packages are updated by hand
const enabled = () => app.isPackaged && process.platform === 'win32';

const SQUIRREL_HOOKS = new Set([
    '--squirrel-install',
    '--squirrel-updated',
    '--squirrel-obsolete',
    '--squirrel-uninstall',
]);

// Handles the installer's hooks, which run the app briefly and expect it to exit. Returns true when
// this process was started for one of them and should quit.
export function handleInstallerEvents(): boolean {
    if (!enabled()) return false;
    // The last Squirrel release installs the first Velopack one and runs it with Squirrel's hooks.
    // Velopack moves the install over on the next launch, so there's nothing to do here.
    if (process.argv.some((arg) => SQUIRREL_HOOKS.has(arg))) return true;
    // Updates downloaded in the background are installed by updateOnLaunch instead, behind the app's
    // own window rather than Velopack's
    VelopackApp.build()
        .setAutoApplyOnStartup(false)
        .setLogger((level, message) => log[level === 'trace' ? 'debug' : level](message))
        .run();
    return false;
}

let manager: UpdateManager | null = null;

// Null when the app isn't installed by Velopack, eg. a Squirrel install that hasn't moved over yet
function updateManager(): UpdateManager | null {
    if (!enabled()) return null;
    try {
        manager ??= new UpdateManager(new HttpSource(FEED_URL));
    } catch (err) {
        log.warn('Updates unavailable:', err instanceof Error ? err.message : err);
    }
    return manager;
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Gives up once progress stops coming, rather than after a fixed time
function download(
    updates: UpdateManager,
    update: UpdateInfo,
    onProgress: (percent: number) => void
) {
    return new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const watchdog = () => {
            clearTimeout(timer);
            timer = setTimeout(() => reject(new Error('Download stalled')), STALL_TIMEOUT_MS);
        };
        watchdog();
        updates
            .downloadUpdateAsync(update, (percent) => {
                watchdog();
                onProgress(percent);
            })
            .then(resolve, reject)
            .finally(() => clearTimeout(timer));
    });
}

// Like Discord: a small window checks for an update before the app opens, and installs it right
// away if there is one
export async function updateOnLaunch(): Promise<LaunchUpdate> {
    const skipped: LaunchUpdate = { installing: false, close: () => undefined };
    const updates = updateManager();
    if (!updates) return skipped;

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
    const loaded = window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
    const setState = (state: UpdateState) =>
        void loaded
            .then(() => window.webContents.executeJavaScript(`setState(${JSON.stringify(state)})`))
            .catch(() => undefined);
    const done = { installing: false, close: () => window.destroy() } as const;
    const restart = (update: UpdateInfo | VelopackAsset) => {
        setState({ status: 'Restarting' });
        updates.waitExitThenApplyUpdate(update, true, true);
        app.quit();
        return { installing: true } as const;
    };

    const pending = updates.getUpdatePendingRestart();
    if (pending) {
        log.info(`Installing ${pending.Version}, downloaded earlier`);
        return restart(pending);
    }

    let update: UpdateInfo | null;
    try {
        update = await withTimeout(
            updates.checkForUpdatesAsync(),
            CHECK_TIMEOUT_MS,
            'Update check'
        );
    } catch (err) {
        log.warn('Update check failed:', err instanceof Error ? err.message : err);
        return done;
    }
    if (!update) return done;

    const version = update.TargetFullRelease.Version;
    log.info(`Updating to ${version}`);
    setState({ status: `Downloading update ${version}`, progress: 0 });
    try {
        await download(updates, update, (progress) =>
            setState({ status: `Downloading update ${version}`, progress })
        );
    } catch (err) {
        // The current version still works, so open that rather than wait on a broken download
        log.warn('Update failed:', err instanceof Error ? err.message : err);
        return done;
    }

    log.info(`Downloaded ${version}, restarting to install it`);
    return restart(update);
}

// Updates found while the app is open download quietly and install on the next launch
export function checkPeriodically() {
    const updates = updateManager();
    if (!updates) return;
    setInterval(async () => {
        try {
            const update = await updates.checkForUpdatesAsync();
            if (update) await updates.downloadUpdateAsync(update);
        } catch (err) {
            log.warn('Background update failed:', err instanceof Error ? err.message : err);
        }
    }, CHECK_INTERVAL_MS).unref();
}
