CREATE TABLE `bot_sticker_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_sticker_sets_bot_name_unique` ON `bot_sticker_sets` (`bot_id`,`name`);