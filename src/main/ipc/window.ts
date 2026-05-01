import { ipcMain } from 'electron';
import { getWindow } from '../context';

export function registerWindowHandlers() {
    ipcMain.on('window:minimize', () => getWindow().minimize());
    ipcMain.on('window:maximize', () => {
        const win = getWindow();
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on('window:close', () => getWindow().close());
}
