ALTER TABLE `settings` ADD `subtitle_language` text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `download_path` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `keep_files` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `download_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `upload_limit` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `max_connections` integer DEFAULT 55 NOT NULL;