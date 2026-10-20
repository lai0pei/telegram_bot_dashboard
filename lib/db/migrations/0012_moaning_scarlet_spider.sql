CREATE TABLE `bot_business_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`connection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`user_chat_id` text NOT NULL,
	`rights` text,
	`is_enabled` integer NOT NULL,
	`connected_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_business_connections_bot_connection_unique` ON `bot_business_connections` (`bot_id`,`connection_id`);--> statement-breakpoint
ALTER TABLE `bot_messages` ADD `business_connection_id` text;--> statement-breakpoint
ALTER TABLE `bot_messages` ADD `deleted_at` integer;