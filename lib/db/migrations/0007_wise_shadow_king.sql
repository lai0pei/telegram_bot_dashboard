ALTER TABLE `bot_messages` ADD `media_type` text;--> statement-breakpoint
ALTER TABLE `bot_messages` ADD `reply_to_message_id` integer;--> statement-breakpoint
ALTER TABLE `bot_messages` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `bot_messages` ADD `pinned` integer DEFAULT false NOT NULL;