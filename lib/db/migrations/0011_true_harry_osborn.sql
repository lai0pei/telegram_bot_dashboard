CREATE TABLE `inline_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bot_id` integer NOT NULL,
	`prefix` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`message_text` text NOT NULL,
	`parse_mode` text,
	`buttons` text,
	`uses` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inline_results_bot_idx` ON `inline_results` (`bot_id`);