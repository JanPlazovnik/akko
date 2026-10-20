import { ipcMain, screen } from 'electron';
import { getWindow } from '../context';

export function registerWindowHandlers() {
    ipcMain.on('window:minimize', () => getWindow().minimize());
    ipcMain.on('window:maximize', () => {
        const win = getWindow();
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on('window:close', () => getWindow().close());
    // Relative to the page, or null outside it; the page gets no mouse events over drag regions
    ipcMain.handle('window:cursor', () => {
        const cursor = screen.getCursorScreenPoint();
        const bounds = getWindow().getContentBounds();
        const x = cursor.x - bounds.x;
        const y = cursor.y - bounds.y;
        return x >= 0 && y >= 0 && x < bounds.width && y < bounds.height ? { x, y } : null;
    });
}
