CREATE TABLE `bot_button_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`name` text NOT NULL,
	`buttons` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bot_button_templates_bot_idx` ON `bot_button_templates` (`bot_id`);--> statement-breakpoint
CREATE TABLE `bot_deep_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`app_short_name` text,
	`admin` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bot_deep_links_bot_idx` ON `bot_deep_links` (`bot_id`);--> statement-breakpoint
CREATE TABLE `bot_games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`short_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_games_bot_short_unique` ON `bot_games` (`bot_id`,`short_name`);--> statement-breakpoint
CREATE TABLE `bot_mini_apps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`short_name` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_mini_apps_bot_short_unique` ON `bot_mini_apps` (`bot_id`,`short_name`);--> statement-breakpoint
ALTER TABLE `auto_replies` ADD `callback_action` text DEFAULT 'toast' NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_replies` ADD `hits` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `auto_replies` ADD `last_hit_at` integer;--> statement-breakpoint
ALTER TABLE `bot_users` ADD `start_payload` text;