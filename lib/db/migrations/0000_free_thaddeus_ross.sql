CREATE TABLE "auto_replies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auto_replies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"match_type" text NOT NULL,
	"pattern" text NOT NULL,
	"reply_text" text NOT NULL,
	"parse_mode" text,
	"buttons" text,
	"reply_keyboard" text,
	"show_alert" boolean DEFAULT false NOT NULL,
	"callback_action" text DEFAULT 'toast' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"last_hit_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_business_connections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_business_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"connection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_chat_id" text NOT NULL,
	"rights" text,
	"is_enabled" boolean NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_button_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_button_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"name" text NOT NULL,
	"buttons" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_chats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_chats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"chat_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"username" text,
	"status" text NOT NULL,
	"rights" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_deep_links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_deep_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"payload" text NOT NULL,
	"app_short_name" text,
	"admin" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_games" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"short_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_join_requests" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_join_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"bio" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"chat_id" text NOT NULL,
	"from_user_id" text,
	"from_username" text,
	"from_first_name" text,
	"direction" text NOT NULL,
	"text" text,
	"raw" text,
	"telegram_message_id" integer,
	"media_type" text,
	"reply_to_message_id" integer,
	"edited_at" timestamp with time zone,
	"pinned" boolean DEFAULT false NOT NULL,
	"business_connection_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_mini_apps" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_mini_apps_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"short_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"url" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bot_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"chat_id" text NOT NULL,
	"username" text,
	"first_name" text,
	"last_seen_at" timestamp with time zone NOT NULL,
	"blocked_at" timestamp with time zone,
	"start_payload" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_user_id" text NOT NULL,
	"telegram_id" text NOT NULL,
	"username" text NOT NULL,
	"first_name" text NOT NULL,
	"encrypted_token" text,
	"token_fetched_at" timestamp with time zone,
	"monitor_enabled" boolean DEFAULT false NOT NULL,
	"last_update_id" integer,
	"health_status" text,
	"health_message" text,
	"health_checked_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"poll_error" text,
	"webhook_last_error" text,
	"webhook_pending_count" integer,
	"setup_progress" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "broadcasts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"text" text NOT NULL,
	"parse_mode" text,
	"buttons" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_user_id" text NOT NULL,
	"telegram_id" text NOT NULL,
	"kind" text NOT NULL,
	"access_hash" text,
	"title" text NOT NULL,
	"username" text,
	"is_creator" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_templates" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text NOT NULL,
	"blurb" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "daily_stats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"telegram_account_id" text NOT NULL,
	"day" text NOT NULL,
	"metric" text NOT NULL,
	"bot_id" integer,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inline_results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inline_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"message_text" text NOT NULL,
	"parse_mode" text,
	"buttons" text,
	"uses" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scheduled_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"chat_id" text NOT NULL,
	"text" text NOT NULL,
	"parse_mode" text,
	"buttons" text,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"telegram_message_id" integer,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"telegram_id" text NOT NULL,
	"encrypted_session_string" text NOT NULL,
	"username" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"revoked_at" timestamp with time zone,
	"digest_frequency" text DEFAULT 'off' NOT NULL,
	"digest_hour" integer DEFAULT 9 NOT NULL,
	"last_digest_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"session_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auto_replies_bot_idx" ON "auto_replies" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auto_replies_one_fallback_unique" ON "auto_replies" USING btree ("bot_id") WHERE "auto_replies"."match_type" = 'fallback';--> statement-breakpoint
CREATE UNIQUE INDEX "bot_business_connections_bot_connection_unique" ON "bot_business_connections" USING btree ("bot_id","connection_id");--> statement-breakpoint
CREATE INDEX "bot_button_templates_bot_idx" ON "bot_button_templates" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_chats_bot_chat_unique" ON "bot_chats" USING btree ("bot_id","chat_id");--> statement-breakpoint
CREATE INDEX "bot_deep_links_bot_idx" ON "bot_deep_links" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_games_bot_short_unique" ON "bot_games" USING btree ("bot_id","short_name");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_join_requests_bot_chat_user_unique" ON "bot_join_requests" USING btree ("bot_id","chat_id","user_id");--> statement-breakpoint
CREATE INDEX "bot_messages_bot_chat_created_idx" ON "bot_messages" USING btree ("bot_id","chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bot_mini_apps_bot_short_unique" ON "bot_mini_apps" USING btree ("bot_id","short_name");--> statement-breakpoint
CREATE UNIQUE INDEX "bots_owner_telegram_id_unique" ON "bots" USING btree ("owner_user_id","telegram_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bots_owner_username_unique" ON "bots" USING btree ("owner_user_id","username");--> statement-breakpoint
CREATE INDEX "broadcasts_bot_idx" ON "broadcasts" USING btree ("bot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "broadcasts_one_active_unique" ON "broadcasts" USING btree ("bot_id") WHERE "broadcasts"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "chats_owner_telegram_id_unique" ON "chats" USING btree ("owner_user_id","telegram_id");--> statement-breakpoint
CREATE INDEX "custom_templates_owner_idx" ON "custom_templates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_stats_unique" ON "daily_stats" USING btree ("telegram_account_id","day","metric","bot_id");--> statement-breakpoint
CREATE INDEX "inline_results_bot_idx" ON "inline_results" USING btree ("bot_id");--> statement-breakpoint
CREATE INDEX "scheduled_messages_status_send_at_idx" ON "scheduled_messages" USING btree ("status","send_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_accounts_telegram_id_unique" ON "telegram_accounts" USING btree ("telegram_id");