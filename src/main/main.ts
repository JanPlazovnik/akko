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

log.initialize();
const logger = createLogger('main');

if (started) {
    app.quit();
}

const createWindow = () => {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'assets/icon.png'),
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

    // A frameless window keeps its invisible resize border in fullscreen, which shows as a
    // grey frame around the video. Dropping resizability while fullscreen removes it.
    mainWindow.on('enter-full-screen', () =>
        setTimeout(() => mainWindow.isFullScreen() && mainWindow.setResizable(false), 100)
    );
    mainWindow.on('leave-html-full-screen', () => mainWindow.setResizable(true));
    mainWindow.on('leave-full-screen', () => mainWindow.setResizable(true));

    mainWindow.webContents.openDevTools();

    return mainWindow;
};

app.on('ready', async () => {
    initDb();
    const settings = dbGetSettings();
    applySettings(settings);

    logger.info('App ready, initializing');
    await initClient(settings);
    logger.info('Creating window');
    const window = createWindow();
    initContext({ window });
    registerAllHandlers();
    logger.info('IPC handlers registered');
    initExtensions().catch((err) => logger.error('Startup failed:', err));
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
