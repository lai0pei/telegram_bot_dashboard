CREATE TABLE `bot_chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`username` text,
	`status` text NOT NULL,
	`rights` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_chats_bot_chat_unique` ON `bot_chats` (`bot_id`,`chat_id`);