import { app, BrowserWindow, session, shell } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';
import { initClient } from './torrent/torrent';
import { initContext } from './context';
import { registerAllHandlers } from './ipc';
import { initDb, dbGetSettings } from './db';
import { initExtensions } from './extensions/manager';
import { createLogger } from './logger';
import { applySettings } from './settings';
import { pruneCache } from './cache';
import { removeLegacyDownloads } from './paths';
import { refreshAnilistAccount } from './accounts/anilist';
import { guardDevTools } from './devtools';
import { checkPeriodically, handleInstallerEvents, updateOnLaunch } from './updater';

log.initialize();
const logger = createLogger('main');

const installerEvent = handleInstallerEvents();
if (installerEvent) {
    app.quit();
}

const isWindows = process.platform === 'win32';

// In development the app runs as electron.exe, so Windows groups it under Electron's identity
// and shows Electron's icon in the taskbar. Packaged builds get their identity from the installer.
if (isWindows && !app.isPackaged) app.setAppUserModelId('akko.dev');

// Chromium pauses hidden videos it thinks have no audio, which includes AC-3 releases played
// through the audio bridge, so covering or minimizing the window would stop the episode
app.commandLine.appendSwitch('disable-features', 'BackgroundVideoPauseOptimization');

// Packaged builds load from file://, which sends no Referer, and YouTube won't embed without one
const EMBED_REFERER = 'https://akko.odstrani.se/';
function allowTrailerEmbeds() {
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['https://www.youtube-nocookie.com/*'] },
        ({ requestHeaders }, callback) => {
            requestHeaders.Referer ??= EMBED_REFERER;
            callback({ requestHeaders });
        }
    );
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        show: false,
        backgroundColor: '#07070a',
        icon: app.isPackaged
            ? undefined
            : path.join(app.getAppPath(), isWindows ? 'assets/icon.ico' : 'assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(
            path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
        );
    }

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    guardDevTools(mainWindow);

    return mainWindow;
};

app.on('ready', async () => {
    // The installer launches the app only to run its hooks. Starting up anyway gets the extension
    // host torn down mid-load, which fails and disables every extension
    if (installerEvent) return;

    const update = await updateOnLaunch();
    if (update.installing) return;

    initDb();
    pruneCache();
    applySettings(dbGetSettings());
    removeLegacyDownloads(dbGetSettings()).catch((err) =>
        logger.warn('Failed to remove old downloads:', err)
    );

    allowTrailerEmbeds();
    logger.info('App ready, creating window');
    const window = createWindow();
    // Closing the update window first would leave no windows open and quit the app
    window.once('ready-to-show', update.close);
    initContext({ window });
    registerAllHandlers();

    initClient().catch((err) => logger.error('Torrent client failed to start:', err));
    initExtensions().catch((err) => logger.error('Extensions failed to start:', err));
    void refreshAnilistAccount();
    checkPeriodically();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
