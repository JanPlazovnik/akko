import type { BrowserWindow } from 'electron';
import koffi from 'koffi';
import { createLogger } from './logger';

const log = createLogger('window');

const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWA_BORDER_COLOR = 34;
const DWMWCP_DEFAULT = 0;
const DWMWCP_DONOTROUND = 1;
const DWMWA_COLOR_DEFAULT = 0xffffffff;
const DWMWA_COLOR_NONE = 0xfffffffe;

type SetWindowAttribute = (
    hwnd: bigint,
    attribute: number,
    value: number[],
    size: number
) => number;

let setWindowAttribute: SetWindowAttribute | null = null;

function api(): SetWindowAttribute | null {
    if (process.platform !== 'win32') return null;
    setWindowAttribute ??= koffi
        .load('dwmapi.dll')
        .func(
            'long __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32_t attribute, _In_ uint32_t *value, uint32_t size)'
        ) as SetWindowAttribute;
    return setWindowAttribute;
}

// Windows 11 outlines every window with a 1px border and rounds its corners, which shows the
// desktop around a window stretched over the display. Older Windows versions ignore both.
export function setWindowFrame(window: BrowserWindow, visible: boolean) {
    try {
        const set = api();
        if (!set) return;
        const hwnd = window.getNativeWindowHandle().readBigUInt64LE();
        set(hwnd, DWMWA_BORDER_COLOR, [visible ? DWMWA_COLOR_DEFAULT : DWMWA_COLOR_NONE], 4);
        set(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            [visible ? DWMWCP_DEFAULT : DWMWCP_DONOTROUND],
            4
        );
    } catch (err) {
        log.warn('Failed to change window frame:', err);
    }
}
