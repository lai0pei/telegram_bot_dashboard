CREATE TABLE "auto_reply_user_hits" (
	"rule_id" integer NOT NULL,
	"bot_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"last_at" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_replies" ADD COLUMN "conditions" text;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_reply_user_hits_rule_user_unique" ON "auto_reply_user_hits" USING btree ("rule_id","user_id");--> statement-breakpoint
CREATE INDEX "auto_reply_user_hits_bot_idx" ON "auto_reply_user_hits" USING btree ("bot_id");