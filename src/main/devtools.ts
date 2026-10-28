import { app, BrowserWindow } from 'electron';
import type { AppSettings } from '../shared/ipc/api';

let enabled = !app.isPackaged;

export function applyDevToolsSettings(settings: AppSettings) {
    enabled = !app.isPackaged || settings.devTools;
    if (enabled) return;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.closeDevTools();
}

export function guardDevTools(window: BrowserWindow) {
    const { webContents } = window;
    // Handled here rather than by the default menu, whose shortcut would open them regardless
    webContents.on('before-input-event', (event, input) => {
        const devToolsKey =
            input.key === 'F12' ||
            (input.control && input.shift && input.key.toLowerCase() === 'i');
        if (input.type !== 'keyDown' || !devToolsKey) return;
        event.preventDefault();
        if (enabled) webContents.toggleDevTools();
    });
    webContents.on('devtools-opened', () => {
        if (!enabled) webContents.closeDevTools();
    });
}
