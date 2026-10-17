import path from 'node:path';
import { app } from 'electron';

export function defaultDownloadPath(): string {
    return path.join(app.getPath('temp'), 'akko');
}
