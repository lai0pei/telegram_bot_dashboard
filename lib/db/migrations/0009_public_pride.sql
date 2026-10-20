CREATE TABLE `auto_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`match_type` text NOT NULL,
	`pattern` text NOT NULL,
	`reply_text` text NOT NULL,
	`parse_mode` text,
	`buttons` text,
	`show_alert` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auto_replies_bot_idx` ON `auto_replies` (`bot_id`);--> statement-breakpoint
CREATE TABLE `bot_join_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`user_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`bio` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bot_join_requests_bot_chat_user_unique` ON `bot_join_requests` (`bot_id`,`chat_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`text` text NOT NULL,
	`parse_mode` text,
	`buttons` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT 0 NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `broadcasts_bot_idx` ON `broadcasts` (`bot_id`);--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`chat_id` text NOT NULL,
	`text` text NOT NULL,
	`parse_mode` text,
	`buttons` text,
	`send_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`telegram_message_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scheduled_messages_status_send_at_idx` ON `scheduled_messages` (`status`,`send_at`);--> statement-breakpoint
ALTER TABLE `bot_users` ADD `blocked_at` integer;--> statement-breakpoint
ALTER TABLE `bots` ADD `health_status` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `health_message` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `health_checked_at` integer;