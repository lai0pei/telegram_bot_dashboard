CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`session_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
--> statement-breakpoint
CREATE TABLE `telegram_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`telegram_id` text NOT NULL,
	`encrypted_session_string` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_name` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_accounts_telegram_id_unique` ON `telegram_accounts` (`telegram_id`);
--> statement-breakpoint
-- Carries every existing single-account login over as an unclaimed
-- telegram_accounts row, keyed by its old Telegram-ID primary key so
-- bots.owner_user_id / chats.owner_user_id (which already equal that same
-- Telegram ID) keep pointing at the right row without any backfill.
-- owner_user_id stays NULL until a dashboard user binds this Telegram
-- account again (lib/mtproto.ts finishLogin claims an unclaimed row by
-- telegram_id instead of inserting a duplicate).
INSERT INTO `telegram_accounts` (`id`, `owner_user_id`, `telegram_id`, `encrypted_session_string`, `username`, `first_name`, `last_name`, `phone`, `created_at`, `updated_at`)
SELECT `user_id`, NULL, `user_id`, `encrypted_session_string`, `username`, `first_name`, `last_name`, `phone`, `created_at`, `updated_at`
FROM `session`;
--> statement-breakpoint
DROP TABLE `session`;
