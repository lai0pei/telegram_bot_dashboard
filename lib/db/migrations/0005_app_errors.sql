CREATE TABLE "app_errors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app_errors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fingerprint" text NOT NULL,
	"source" text NOT NULL,
	"what" text NOT NULL,
	"error_name" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_errors_fingerprint_unique" ON "app_errors" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "app_errors_last_seen_idx" ON "app_errors" USING btree ("last_seen_at");