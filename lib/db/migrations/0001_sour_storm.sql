-- Multi-user support: `session` becomes one row per Telegram user (keyed by
-- user_id instead of a singleton id=1), and `bots` gains `owner_user_id` so
-- each bot is scoped to the user who created it.
--
-- Hand-written (not drizzle-kit's auto-generated ALTER) because the existing
-- single-user deployment has rows in `bots` with no owner yet: the only
-- Telegram user on record in `session` is assumed to own all of them.
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_session` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted_session_string` text NOT NULL,
	`username` text,
	`first_name` text,
	`last_name` text,
	`phone` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_session` ("user_id", "encrypted_session_string", "username", "first_name", "last_name", "phone", "created_at", "updated_at")
SELECT "user_id", "encrypted_session_string", "username", "first_name", "last_name", "phone", "created_at", "updated_at" FROM `session`;
--> statement-breakpoint
DROP TABLE `session`;
--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;
--> statement-breakpoint
ALTER TABLE `bots` ADD `owner_user_id` text;
--> statement-breakpoint
UPDATE `bots` SET `owner_user_id` = (SELECT `user_id` FROM `session` LIMIT 1) WHERE `owner_user_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `bots_telegram_id_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `bots_username_unique`;
--> statement-breakpoint
CREATE TABLE `__new_bots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
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
INSERT INTO `__new_bots` ("id", "owner_user_id", "telegram_id", "username", "first_name", "encrypted_token", "token_fetched_at", "monitor_enabled", "last_update_id", "created_at", "updated_at")
SELECT "id", "owner_user_id", "telegram_id", "username", "first_name", "encrypted_token", "token_fetched_at", "monitor_enabled", "last_update_id", "created_at", "updated_at" FROM `bots`;
--> statement-breakpoint
DROP TABLE `bots`;
--> statement-breakpoint
ALTER TABLE `__new_bots` RENAME TO `bots`;
--> statement-breakpoint
CREATE UNIQUE INDEX `bots_owner_telegram_id_unique` ON `bots` (`owner_user_id`,`telegram_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `bots_owner_username_unique` ON `bots` (`owner_user_id`,`username`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
