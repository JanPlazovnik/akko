CREATE TABLE IF NOT EXISTS `extensions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`type` text NOT NULL,
	`accuracy` text NOT NULL,
	`ratio` real DEFAULT 0,
	`media` text NOT NULL,
	`languages` text NOT NULL,
	`icon` text,
	`description` text,
	`update_url` text NOT NULL,
	`code_url` text NOT NULL,
	`cached_code` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`installed_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`id` integer PRIMARY KEY CHECK (`id` = 1) NOT NULL,
	`log_level` text DEFAULT 'debug' NOT NULL,
	`log_to_file` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `settings` (`id`) VALUES (1);
