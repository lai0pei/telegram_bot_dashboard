CREATE TABLE "rule_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rule_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bot_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"file_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_replies" ADD COLUMN "media" text;--> statement-breakpoint
ALTER TABLE "auto_replies" ADD COLUMN "follow_ups" text;--> statement-breakpoint
CREATE INDEX "rule_media_bot_idx" ON "rule_media" USING btree ("bot_id");