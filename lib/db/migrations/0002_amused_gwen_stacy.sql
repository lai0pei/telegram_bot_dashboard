CREATE TABLE `chats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`telegram_id` text NOT NULL,
	`kind` text NOT NULL,
	`access_hash` text,
	`title` text NOT NULL,
	`username` text,
	`is_creator` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chats_owner_telegram_id_unique` ON `chats` (`owner_user_id`,`telegram_id`);