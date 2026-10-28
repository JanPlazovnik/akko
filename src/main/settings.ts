import { mkdir, rm, statfs, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog, shell } from 'electron';
import {
    LOG_LEVELS,
    TITLE_LANGUAGES,
    type AppSettings,
    type FolderCheck,
    type SettingsPaths,
} from '../shared/ipc/api';
import { dbGetSettings, dbSaveSettings } from './db';
import { configureLogger, getLogFilePath } from './logger';
import { applyTorrentSettings } from './torrent/torrent';
import { defaultDownloadPath } from './paths';
import { getWindow } from './context';
import { applyDiscordSettings } from './discord';
import { applyDevToolsSettings } from './devtools';

const TMPFS_MAGIC = 0x01021994;

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(Number(value) || 0)));

function sanitize(patch: Partial<AppSettings>): Partial<AppSettings> {
    const clean: Partial<AppSettings> = {};
    if (patch.logLevel !== undefined && LOG_LEVELS.includes(patch.logLevel)) {
        clean.logLevel = patch.logLevel;
    }
    if (patch.logToFile !== undefined) clean.logToFile = Boolean(patch.logToFile);
    if (patch.keepFiles !== undefined) clean.keepFiles = Boolean(patch.keepFiles);
    if (patch.syncProgress !== undefined) clean.syncProgress = Boolean(patch.syncProgress);
    if (patch.autoPickRelease !== undefined) {
        clean.autoPickRelease = Boolean(patch.autoPickRelease);
    }
    if (patch.autoplayNext !== undefined) clean.autoplayNext = Boolean(patch.autoplayNext);
    if (patch.showStreamStats !== undefined) {
        clean.showStreamStats = Boolean(patch.showStreamStats);
    }
    if (patch.holidayEffects !== undefined) clean.holidayEffects = Boolean(patch.holidayEffects);
    if (patch.devTools !== undefined) clean.devTools = Boolean(patch.devTools);
    if (patch.subtitleLanguage !== undefined) {
        clean.subtitleLanguage = String(patch.subtitleLanguage).slice(0, 16);
    }
    if (patch.downloadPath !== undefined) {
        clean.downloadPath = patch.downloadPath ? path.resolve(patch.downloadPath) : null;
    }
    if (patch.downloadLimit !== undefined) {
        clean.downloadLimit = clamp(patch.downloadLimit, 0, 1_000_000);
    }
    if (patch.uploadLimit !== undefined) clean.uploadLimit = clamp(patch.uploadLimit, 0, 1_000_000);
    if (patch.maxConnections !== undefined) {
        clean.maxConnections = clamp(patch.maxConnections, 1, 500);
    }
    if (patch.onboarded !== undefined) clean.onboarded = Boolean(patch.onboarded);
    if (patch.discordPresence !== undefined) clean.discordPresence = Boolean(patch.discordPresence);
    if (patch.discordShowDetails !== undefined) {
        clean.discordShowDetails = Boolean(patch.discordShowDetails);
    }
    if (patch.titleLanguage !== undefined && TITLE_LANGUAGES.includes(patch.titleLanguage)) {
        clean.titleLanguage = patch.titleLanguage;
    }
    return clean;
}

export function applySettings(settings: AppSettings) {
    configureLogger({ level: settings.logLevel, logToFile: settings.logToFile });
    applyTorrentSettings(settings);
    applyDiscordSettings(settings);
    applyDevToolsSettings(settings);
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
    dbSaveSettings(sanitize(patch));
    const settings = dbGetSettings();
    applySettings(settings);
    return settings;
}

export function settingsPaths(): SettingsPaths {
    return { defaultDownloadPath: defaultDownloadPath(), logFile: getLogFilePath() };
}

export async function chooseFolder(current: string): Promise<string | null> {
    const result = await dialog.showOpenDialog(getWindow(), {
        defaultPath: current,
        properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
}

export async function checkFolder(folder: string): Promise<FolderCheck> {
    try {
        await mkdir(folder, { recursive: true });
        const probe = path.join(folder, `.akko-write-test-${process.pid}`);
        await writeFile(probe, '');
        await rm(probe);
        const { bavail, bsize, type } = await statfs(folder);
        return { writable: true, freeBytes: bavail * bsize, inMemory: type === TMPFS_MAGIC };
    } catch (err) {
        return { writable: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export async function openDownloads() {
    const dir = dbGetSettings().downloadPath ?? defaultDownloadPath();
    await mkdir(dir, { recursive: true });
    await shell.openPath(dir);
}

export async function openLogs() {
    await shell.openPath(path.dirname(getLogFilePath()));
}
