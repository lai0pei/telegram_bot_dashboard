ALTER TABLE `telegram_accounts` ADD `digest_frequency` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_accounts` ADD `digest_hour` integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_accounts` ADD `last_digest_at` integer;