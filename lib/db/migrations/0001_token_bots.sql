ALTER TABLE "bots" ADD COLUMN "source" text DEFAULT 'owned' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bots_telegram_id_unique" ON "bots" USING btree ("telegram_id");