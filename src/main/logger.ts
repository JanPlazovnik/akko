import log from 'electron-log/main';
import type { LevelOption } from 'electron-log';

export type LogLevel = Exclude<LevelOption, false>;

log.transports.console.format = '%c{iso} [{level}]{scope}%c | {text}';
log.transports.file.format = '[{iso}] [{level}]{scope} {text}';
log.transports.file.level = false;

export function configureLogger(opts: { level?: LogLevel; logToFile?: boolean }) {
    const level = opts.level ?? (log.transports.console.level as LogLevel);
    const logToFile = opts.logToFile ?? log.transports.file.level !== false;

    log.transports.console.level = level;
    log.transports.file.level = logToFile ? level : false;
}

export function getLogFilePath(): string {
    return log.transports.file.getFile().path;
}

export function createLogger(module: string) {
    return log.scope(module);
}
