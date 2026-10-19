CREATE TABLE `bot_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`from_user_id` text,
	`from_username` text,
	`from_first_name` text,
	`direction` text NOT NULL,
	`text` text,
	`raw` text,
	`telegram_message_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_id` text NOT NULL,
	`username` text NOT NULL,
	`first_name` text NOT NULL,
	`encrypted_token` text,
	`token_fetched_at` integer,
	`monitor_enabled` integer DEFAULT false NOT NULL,
	`last_update_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bots_telegram_id_unique` ON `bots` (`telegram_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bots_username_unique` ON `bots` (`username`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` integer PRIMARY KEY NOT NULL,
	`encrypted_session_string` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_name` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
