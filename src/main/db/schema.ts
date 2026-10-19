import { blob, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey(),
    logLevel: text('log_level').notNull().default('debug'),
    logToFile: integer('log_to_file', { mode: 'boolean' }).notNull().default(false),
    subtitleLanguage: text('subtitle_language').notNull().default('en'),
    downloadPath: text('download_path'),
    keepFiles: integer('keep_files', { mode: 'boolean' }).notNull().default(false),
    downloadLimit: integer('download_limit').notNull().default(0),
    uploadLimit: integer('upload_limit').notNull().default(0),
    maxConnections: integer('max_connections').notNull().default(55),
    onboarded: integer('onboarded', { mode: 'boolean' }).notNull().default(false),
    titleLanguage: text('title_language').notNull().default('ANILIST'),
    syncProgress: integer('sync_progress', { mode: 'boolean' }).notNull().default(true),
});

export const extensions = sqliteTable('extensions', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    version: text('version').notNull(),
    type: text('type').notNull(),
    accuracy: text('accuracy').notNull(),
    ratio: real('ratio').default(0),
    media: text('media').notNull(),
    languages: text('languages').notNull(),
    icon: text('icon'),
    description: text('description'),
    update: text('update_url').notNull(),
    codeUrl: text('code_url').notNull(),
    cachedCode: text('cached_code').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

export const cache = sqliteTable('cache', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    fetchedAt: integer('fetched_at').notNull(),
});

export const accounts = sqliteTable('accounts', {
    provider: text('provider').primaryKey(),
    userId: integer('user_id').notNull(),
    name: text('name').notNull(),
    avatar: text('avatar'),
    scoreFormat: text('score_format').notNull(),
    titleLanguage: text('title_language').notNull().default('ROMAJI'),
    token: blob('token', { mode: 'buffer' }).notNull(),
    expiresAt: integer('expires_at').notNull(),
});

export const watchProgress = sqliteTable(
    'watch_progress',
    {
        anilistId: integer('anilist_id').notNull(),
        episode: integer('episode').notNull(),
        position: real('position').notNull(),
        duration: real('duration').notNull(),
        finished: integer('finished', { mode: 'boolean' }).notNull().default(false),
        // The WatchSelection as JSON, so the same release can be resumed without searching again
        selection: text('selection').notNull(),
        updatedAt: integer('updated_at').notNull(),
    },
    (t) => [primaryKey({ columns: [t.anilistId, t.episode] })]
);
