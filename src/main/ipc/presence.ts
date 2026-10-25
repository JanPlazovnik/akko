import { ipcMain } from 'electron';
import type { PresenceState } from '../../shared/ipc/api';
import { setPresence } from '../discord';

export function registerPresenceHandlers() {
    ipcMain.on('presence:set', (_e, state: PresenceState | null) => setPresence(state));
}
