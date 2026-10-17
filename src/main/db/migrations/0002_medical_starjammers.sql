CREATE TABLE `cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`fetched_at` integer NOT NULL
);
