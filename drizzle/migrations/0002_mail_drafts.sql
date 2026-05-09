CREATE TYPE "public"."mail_draft_status" AS ENUM('drafting', 'awaiting_regen', 'awaiting_attachment', 'sent', 'cancelled');--> statement-breakpoint
CREATE TABLE "mail_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_email" text NOT NULL,
	"subject" text,
	"body" text,
	"instruction" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "mail_draft_status" DEFAULT 'drafting' NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_preview_msg_id" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_drafts_chat_status_idx" ON "mail_drafts" ("telegram_chat_id","status");
