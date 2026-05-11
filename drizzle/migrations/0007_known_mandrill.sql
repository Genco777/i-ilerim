CREATE TYPE "public"."business_override_kind" AS ENUM('offered', 'not_offered', 'note', 'tone', 'signature');--> statement-breakpoint
CREATE TYPE "public"."content_channel" AS ENUM('feed', 'story', 'reel');--> statement-breakpoint
CREATE TYPE "public"."content_pillar" AS ENUM('vitrine', 'prozess', 'insight', 'lokal', 'reel');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('collecting', 'preview', 'sent', 'cancelled', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('rechnung', 'teilrechnung', 'schlussrechnung');--> statement-breakpoint
CREATE TYPE "public"."kleinanzeigen_thread_status" AS ENUM('new', 'awaiting_action', 'awaiting_custom', 'awaiting_refinement', 'awaiting_gap_info', 'awaiting_image', 'drafting', 'sent', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."mail_draft_status" AS ENUM('drafting', 'awaiting_regen', 'awaiting_attachment', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('draft', 'approved', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('pending', 'generated', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "business_profile_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"kind" "business_override_kind" DEFAULT 'note' NOT NULL,
	"origin" text DEFAULT 'telegram' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_profile_overrides_topic_kind_unique" UNIQUE("topic","kind")
);
--> statement-breakpoint
CREATE TABLE "content_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_week" integer NOT NULL,
	"year" integer NOT NULL,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "content_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"time_slot" text NOT NULL,
	"pillar" "content_pillar" NOT NULL,
	"channel" "content_channel" DEFAULT 'feed' NOT NULL,
	"topic" text,
	"post_id" uuid,
	"status" "slot_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "failed_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"error" text NOT NULL,
	"retry_count" integer NOT NULL,
	"failed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retried_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incoming_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "message_platform" NOT NULL,
	"external_id" text NOT NULL,
	"parent_post_id" text,
	"parent_comment_id" text,
	"sender_name" text NOT NULL,
	"sender_external_id" text NOT NULL,
	"message_text" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"status" "message_status" DEFAULT 'new' NOT NULL,
	"draft_reply" text,
	"final_reply" text,
	"reply_external_id" text,
	"replied_at" timestamp with time zone,
	"ignored_at" timestamp with time zone,
	"received_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incoming_messages_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
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
CREATE TABLE "kleinanzeigen_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" text,
	"routing_token" text NOT NULL,
	"sender_address" text NOT NULL,
	"buyer_name" text,
	"listing_title" text,
	"raw_body" text NOT NULL,
	"ai_analysis" jsonb,
	"status" "kleinanzeigen_thread_status" DEFAULT 'new' NOT NULL,
	"draft_reply" text,
	"final_reply" text,
	"pending_gap_topic" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_message_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "kleinanzeigen_threads_email_message_id_unique" UNIQUE("email_message_id")
);
--> statement-breakpoint
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
	"in_reply_to_message_id" text,
	"mail_references" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "mail_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" integer NOT NULL,
	"folder" text DEFAULT 'INBOX' NOT NULL,
	"message_id" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text,
	"body_preview" text,
	"received_at" timestamp with time zone NOT NULL,
	"replied_draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "content_pillar" "content_pillar";--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "calendar_week" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "channel" "content_channel" DEFAULT 'feed';--> statement-breakpoint
ALTER TABLE "content_slots" ADD CONSTRAINT "content_slots_plan_id_content_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."content_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_slots" ADD CONSTRAINT "content_slots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_inbox" ADD CONSTRAINT "mail_inbox_replied_draft_id_mail_drafts_id_fk" FOREIGN KEY ("replied_draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_slots_plan_day_time_idx" ON "content_slots" USING btree ("plan_id","day_of_week","time_slot");--> statement-breakpoint
CREATE INDEX "invoices_chat_status_idx" ON "invoices" USING btree ("telegram_chat_id","status");--> statement-breakpoint
CREATE INDEX "kleinanzeigen_threads_chat_status_idx" ON "kleinanzeigen_threads" USING btree ("telegram_chat_id","status");--> statement-breakpoint
CREATE INDEX "mail_drafts_chat_status_idx" ON "mail_drafts" USING btree ("telegram_chat_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_inbox_folder_uid_idx" ON "mail_inbox" USING btree ("folder","uid");