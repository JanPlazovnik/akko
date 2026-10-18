CREATE TABLE `accounts` (
	`provider` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`score_format` text NOT NULL,
	`token` blob NOT NULL,
	`expires_at` integer NOT NULL
);
