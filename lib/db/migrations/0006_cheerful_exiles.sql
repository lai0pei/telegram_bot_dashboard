CREATE TABLE `daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_account_id` text NOT NULL,
	`day` text NOT NULL,
	`metric` text NOT NULL,
	`bot_id` integer,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_stats_unique` ON `daily_stats` (`telegram_account_id`,`day`,`metric`,`bot_id`);--> statement-breakpoint
ALTER TABLE `bots` ADD `last_polled_at` integer;--> statement-breakpoint
ALTER TABLE `bots` ADD `poll_error` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `webhook_last_error` text;--> statement-breakpoint
ALTER TABLE `bots` ADD `webhook_pending_count` integer;--> statement-breakpoint
ALTER TABLE `telegram_accounts` ADD `digest_frequency` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_accounts` ADD `digest_hour` integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_accounts` ADD `last_digest_at` integer;