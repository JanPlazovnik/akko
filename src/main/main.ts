import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import log from 'electron-log/main';
import { initClient } from './torrent/torrent';
import { initContext } from './context';
import { registerAllHandlers } from './ipc';
import { initDb, dbGetSettings } from './db';
import { initExtensions } from './extensions/manager';
import { createLogger } from './logger';
import { applySettings } from './settings';
import { pruneCache } from './cache';
import { useBorderlessFullscreen } from './fullscreen';

log.initialize();
const logger = createLogger('main');

if (started) {
    app.quit();
}

const isWindows = process.platform === 'win32';

// In development the app runs as electron.exe, so Windows groups it under Electron's identity
// and shows Electron's icon in the taskbar. Packaged builds get their identity from the installer.
if (isWindows && !app.isPackaged) app.setAppUserModelId('akko.dev');

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        show: false,
        backgroundColor: '#07070a',
        fullscreenable: !isWindows,
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

    if (isWindows) useBorderlessFullscreen(mainWindow);
    mainWindow.once('ready-to-show', () => mainWindow.show());

    if (!app.isPackaged) {
        mainWindow.webContents.on('before-input-event', (event, input) => {
            const devToolsKey =
                input.key === 'F12' ||
                (input.control && input.shift && input.key.toLowerCase() === 'i');
            if (input.type === 'keyDown' && devToolsKey) {
                mainWindow.webContents.toggleDevTools();
                event.preventDefault();
            }
        });
    }

    return mainWindow;
};

app.on('ready', () => {
    initDb();
    pruneCache();
    applySettings(dbGetSettings());

    logger.info('App ready, creating window');
    initContext({ window: createWindow() });
    registerAllHandlers();

    initClient().catch((err) => logger.error('Torrent client failed to start:', err));
    initExtensions().catch((err) => logger.error('Extensions failed to start:', err));
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
