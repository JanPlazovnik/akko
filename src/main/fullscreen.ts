import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { setWindowFrame } from './window-frame';

// Windows' own fullscreen keeps a frameless window's resize border around the content, so the
// window is created non-fullscreenable (HTML fullscreen then only fills the window) and is
// stretched over the display instead.
export function useBorderlessFullscreen(window: BrowserWindow) {
    let restore: { bounds: Rectangle; maximized: boolean } | null = null;

    window.webContents.on('enter-html-full-screen', () => {
        restore = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
        const { bounds } = screen.getDisplayMatching(window.getBounds());
        window.setResizable(false);
        setWindowFrame(window, false);
        if (restore.maximized) window.unmaximize();
        window.setBounds(bounds);
    });

    window.webContents.on('leave-html-full-screen', () => {
        if (!restore) return;
        const { bounds, maximized } = restore;
        restore = null;
        window.setResizable(true);
        setWindowFrame(window, true);
        window.setBounds(bounds);
        if (maximized) window.maximize();
    });
}
