import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
    id: integer('id').primaryKey(),
    logLevel: text('log_level').notNull().default('debug'),
    logToFile: integer('log_to_file', { mode: 'boolean' }).notNull().default(false),
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
