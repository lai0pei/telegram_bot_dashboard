CREATE TABLE `custom_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_user_id` text NOT NULL,
	`title` text NOT NULL,
	`emoji` text NOT NULL,
	`blurb` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_templates_owner_idx` ON `custom_templates` (`owner_user_id`);