/// <reference types="vite/client" />
import { spawn } from 'node:child_process';
import path from 'node:path';
import { app, autoUpdater, BrowserWindow } from 'electron';
import icon from '../../assets/icon.svg?raw';
import { createLogger } from './logger';

const log = createLogger('updater');

const FEED_URL = 'https://github.com/JanPlazovnik/akko/releases/latest/download';
const CHECK_TIMEOUT_MS = 10_000;
// Downloads only give up once progress stops coming; installing always runs to the end
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
    background: linear-gradient(90deg, rgb(167 139 250 / 0.4), #a78bfa, #c4b5fd); }
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

// Squirrel installs updates on Windows only; AppImage and distro packages are updated by hand
const enabled = () => app.isPackaged && process.platform === 'win32';

const updateExe = () => path.resolve(path.dirname(process.execPath), '..', 'Update.exe');

// Update.exe prints its progress as a number per line, and a check ends with a JSON summary
function runUpdateExe(
    args: string[],
    timeoutMs: number,
    onLine: (line: string) => void = () => undefined
): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const child = spawn(updateExe(), args, { windowsHide: true });
        const lines: string[] = [];
        let pending = '';
        let timer: ReturnType<typeof setTimeout>;
        const watchdog = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                child.kill();
                reject(new Error(`Update.exe ${args[0]} timed out`));
            }, timeoutMs);
        };
        const take = (line: string) => {
            if (!line.trim()) return;
            lines.push(line.trim());
            onLine(line.trim());
            watchdog();
        };
        watchdog();
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
            const parts = (pending + chunk).split(/\r?\n/);
            pending = parts.pop() ?? '';
            parts.forEach(take);
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            take(pending);
            if (code === 0) resolve(lines);
            else reject(new Error(`Update.exe ${args[0]} exited with ${code}`));
        });
    });
}

async function availableVersion(): Promise<string | null> {
    const lines = await runUpdateExe(['--checkForUpdate', FEED_URL], CHECK_TIMEOUT_MS);
    const summary = JSON.parse(lines.at(-1) ?? '{}') as {
        releasesToApply?: { version: string }[];
    };
    return summary.releasesToApply?.at(-1)?.version ?? null;
}

// An update reports 0 to 33 while checking, 33 to 66 while downloading and 66 to 100 while
// installing, so each step gets its own bar
function describe(version: string, total: number): UpdateState {
    if (total < 33) return { status: `Preparing update ${version}` };
    if (total < 66) return { status: `Downloading update ${version}`, progress: (total - 33) * 3 };
    return { status: `Installing update ${version}`, progress: Math.min(100, (total - 66) * 3) };
}

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
    const loaded = window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`);
    const setState = (state: UpdateState) =>
        void loaded
            .then(() => window.webContents.executeJavaScript(`setState(${JSON.stringify(state)})`))
            .catch(() => undefined);
    const done = { installing: false, close: () => window.destroy() } as const;

    let version: string | null;
    try {
        version = await availableVersion();
    } catch (err) {
        log.warn('Update check failed:', err instanceof Error ? err.message : err);
        return done;
    }
    if (!version) return done;

    log.info(`Updating to ${version}`);
    setState(describe(version, 0));
    try {
        await runUpdateExe(['--update', FEED_URL], STALL_TIMEOUT_MS, (line) => {
            const total = Number(line);
            if (!Number.isNaN(total)) setState(describe(version, total));
        });
    } catch (err) {
        // The current version still works, so open that rather than one that may be half installed
        log.warn('Update failed:', err instanceof Error ? err.message : err);
        return done;
    }

    setState({ status: 'Restarting' });
    log.info(`Installed ${version}, restarting`);
    // What autoUpdater.quitAndInstall does: Update.exe starts the newest version once this one exits
    spawn(updateExe(), ['--processStartAndWait', path.basename(process.execPath)], {
        detached: true,
        stdio: 'ignore',
    }).unref();
    app.quit();
    return { installing: true };
}

// Updates found while the app is open download quietly and apply on the next launch
export function checkPeriodically() {
    if (!enabled()) return;
    setInterval(() => autoUpdater.checkForUpdates(), CHECK_INTERVAL_MS).unref();
}
