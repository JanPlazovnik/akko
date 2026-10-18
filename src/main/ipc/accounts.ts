import { ipcMain } from 'electron';
import { getAnilistAccount, loginAnilist, logoutAnilist } from '../accounts/anilist';

export function registerAccountHandlers() {
    ipcMain.handle('accounts:get', () => ({ anilist: getAnilistAccount() }));
    ipcMain.handle('accounts:anilist-login', () => loginAnilist());
    ipcMain.handle('accounts:anilist-logout', () => logoutAnilist());
}
