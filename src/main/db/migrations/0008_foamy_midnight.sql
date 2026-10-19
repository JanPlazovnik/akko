CREATE TABLE `watch_progress` (
	`anilist_id` integer NOT NULL,
	`episode` integer NOT NULL,
	`position` real NOT NULL,
	`duration` real NOT NULL,
	`finished` integer DEFAULT false NOT NULL,
	`selection` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`anilist_id`, `episode`)
);
