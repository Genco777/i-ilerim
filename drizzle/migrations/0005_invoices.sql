DO $$ BEGIN
 CREATE TYPE "invoice_status" AS ENUM ('collecting', 'preview', 'sent', 'cancelled', 'deleted');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "invoice_type" AS ENUM ('rechnung', 'teilrechnung', 'schlussrechnung');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"type" "invoice_type" NOT NULL,
	"date" text NOT NULL,
	"recipient" jsonb,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"footer_note" text,
	"status" "invoice_status" DEFAULT 'collecting' NOT NULL,
	"current_step" text,
	"pending_item" jsonb,
	"pdf_blob_url" text,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_preview_msg_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_chat_status_idx" ON "invoices" ("telegram_chat_id","status");
