import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import type { ExtensionManifest, InstalledExtension } from './types';

let db: Database.Database;

export function initDb() {
    const dbPath = path.join(app.getPath('userData'), 'akko.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS extensions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            type TEXT NOT NULL,
            accuracy TEXT NOT NULL,
            ratio REAL DEFAULT 0,
            media TEXT NOT NULL,
            languages TEXT NOT NULL,
            icon TEXT,
            description TEXT,
            update_url TEXT NOT NULL,
            code_url TEXT NOT NULL,
            cached_code TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            installed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    `);
}

export function getDb() {
    return db;
}

interface ExtensionRow {
    id: string;
    name: string;
    version: string;
    type: string;
    accuracy: string;
    ratio: number;
    media: string;
    languages: string;
    icon: string | null;
    description: string | null;
    update_url: string;
    code_url: string;
    cached_code: string;
    enabled: number;
    installed_at: string;
    updated_at: string;
}

function rowToExtension(row: ExtensionRow): InstalledExtension {
    return {
        id: row.id,
        name: row.name,
        version: row.version,
        type: row.type as InstalledExtension['type'],
        accuracy: row.accuracy as InstalledExtension['accuracy'],
        ratio: row.ratio,
        media: row.media as InstalledExtension['media'],
        languages: JSON.parse(row.languages),
        icon: row.icon ?? undefined,
        description: row.description ?? undefined,
        update: row.update_url,
        codeUrl: row.code_url,
        enabled: row.enabled === 1,
        installedAt: row.installed_at,
        updatedAt: row.updated_at,
    };
}

export function dbGetAllExtensions(): InstalledExtension[] {
    const rows = db.prepare('SELECT * FROM extensions').all() as ExtensionRow[];
    return rows.map(rowToExtension);
}

export function dbGetEnabledExtensions(): Array<InstalledExtension & { cachedCode: string }> {
    const rows = db.prepare('SELECT * FROM extensions WHERE enabled = 1').all() as ExtensionRow[];
    return rows.map((row) => ({ ...rowToExtension(row), cachedCode: row.cached_code }));
}

export function dbGetExtensionCode(id: string): string | null {
    const row = db.prepare('SELECT cached_code FROM extensions WHERE id = ?').get(id) as
        | Pick<ExtensionRow, 'cached_code'>
        | undefined;
    return row?.cached_code ?? null;
}

export function dbInstallExtension(manifest: ExtensionManifest, code: string) {
    const now = new Date().toISOString();
    db.prepare(
        `
        INSERT INTO extensions
            (id, name, version, type, accuracy, ratio, media, languages, icon, description,
             update_url, code_url, cached_code, enabled, installed_at, updated_at)
        VALUES
            (@id, @name, @version, @type, @accuracy, @ratio, @media, @languages, @icon, @description,
             @update_url, @code_url, @cached_code, 1, @now, @now)
    `
    ).run({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        type: manifest.type,
        accuracy: manifest.accuracy,
        ratio: manifest.ratio ?? 0,
        media: manifest.media,
        languages: JSON.stringify(manifest.languages),
        icon: manifest.icon ?? null,
        description: manifest.description ?? null,
        update_url: manifest.update,
        code_url: manifest.code,
        cached_code: code,
        now,
    });
}

export function dbUninstallExtension(id: string) {
    db.prepare('DELETE FROM extensions WHERE id = ?').run(id);
}

export function dbSetEnabled(id: string, enabled: boolean) {
    db.prepare('UPDATE extensions SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function dbUpdateExtensionCode(id: string, version: string, code: string) {
    db.prepare(
        `
        UPDATE extensions SET version = ?, cached_code = ?, updated_at = ? WHERE id = ?
    `
    ).run(version, code, new Date().toISOString(), id);
}

export function dbExtensionExists(id: string): boolean {
    const row = db.prepare('SELECT 1 FROM extensions WHERE id = ?').get(id);
    return !!row;
}
