/// <reference types="vite/client" />
import type Database from 'better-sqlite3';

// SQL files are inlined at build time by Vite — no filesystem access needed at runtime.
const migrationFiles = import.meta.glob('./migrations/*.sql', {
    eager: true,
    query: '?raw',
    import: 'default',
}) as Record<string, string>;

export function runMigrations(sqlite: Database.Database): void {
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS __migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
    `);

    const applied = new Set(
        (sqlite.prepare('SELECT name FROM __migrations').all() as { name: string }[]).map(
            (r) => r.name
        )
    );

    const sorted = Object.entries(migrationFiles).sort(([a], [b]) => a.localeCompare(b));

    for (const [filePath, sql] of sorted) {
        const name = filePath.split('/').pop()!;
        if (applied.has(name)) continue;

        for (const statement of sql.split('--> statement-breakpoint')) {
            const trimmed = statement.trim();
            if (trimmed) sqlite.exec(trimmed);
        }

        sqlite
            .prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)')
            .run(name, new Date().toISOString());
    }
}
