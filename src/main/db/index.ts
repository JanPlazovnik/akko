import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { app } from 'electron';
import { settings, extensions } from './schema';
import { runMigrations } from './migrator';
import type { ExtensionManifest, InstalledExtension } from '../extensions/types';
import type { AppSettings } from '../../shared/ipc/api';

type ExtensionRow = typeof extensions.$inferSelect;

let db: ReturnType<typeof drizzle>;

export function initDb() {
    const sqlite = new Database(path.join(app.getPath('userData'), 'akko.db'));
    sqlite.pragma('journal_mode = WAL');
    runMigrations(sqlite);
    db = drizzle(sqlite);
}

function getDb() {
    if (!db) throw new Error('Database not initialized');
    return db;
}

function parseExtension(row: ExtensionRow): InstalledExtension {
    return {
        id: row.id,
        name: row.name,
        version: row.version,
        type: row.type as InstalledExtension['type'],
        accuracy: row.accuracy as InstalledExtension['accuracy'],
        ratio: row.ratio ?? 0,
        media: row.media as InstalledExtension['media'],
        languages: JSON.parse(row.languages) as string[],
        icon: row.icon ?? undefined,
        description: row.description ?? undefined,
        update: row.update,
        codeUrl: row.codeUrl,
        enabled: row.enabled,
        installedAt: row.installedAt,
        updatedAt: row.updatedAt,
    };
}

export function dbGetSettings(): AppSettings {
    const { id, ...row } = getDb().select().from(settings).get()!;
    return { ...row, logLevel: row.logLevel as AppSettings['logLevel'] };
}

export function dbSaveSettings(patch: Partial<AppSettings>): void {
    getDb().update(settings).set(patch).where(eq(settings.id, 1)).run();
}

export function dbGetAllExtensions(): InstalledExtension[] {
    return getDb().select().from(extensions).all().map(parseExtension);
}

export function dbGetEnabledExtensions(): Array<InstalledExtension & { cachedCode: string }> {
    return getDb()
        .select()
        .from(extensions)
        .where(eq(extensions.enabled, true))
        .all()
        .map((row) => ({ ...parseExtension(row), cachedCode: row.cachedCode }));
}

export function dbGetExtensionCode(id: string): string | null {
    const row = getDb()
        .select({ cachedCode: extensions.cachedCode })
        .from(extensions)
        .where(eq(extensions.id, id))
        .get();
    return row?.cachedCode ?? null;
}

export function dbInstallExtension(manifest: ExtensionManifest, code: string): void {
    const now = new Date().toISOString();
    getDb()
        .insert(extensions)
        .values({
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
            update: manifest.update,
            codeUrl: manifest.code,
            cachedCode: code,
            enabled: true,
            installedAt: now,
            updatedAt: now,
        })
        .run();
}

export function dbUninstallExtension(id: string): void {
    getDb().delete(extensions).where(eq(extensions.id, id)).run();
}

export function dbSetEnabled(id: string, enabled: boolean): void {
    getDb().update(extensions).set({ enabled }).where(eq(extensions.id, id)).run();
}

export function dbUpdateExtensionCode(id: string, version: string, code: string): void {
    getDb()
        .update(extensions)
        .set({ version, cachedCode: code, updatedAt: new Date().toISOString() })
        .where(eq(extensions.id, id))
        .run();
}

export function dbExtensionExists(id: string): boolean {
    return !!getDb()
        .select({ id: extensions.id })
        .from(extensions)
        .where(eq(extensions.id, id))
        .get();
}
