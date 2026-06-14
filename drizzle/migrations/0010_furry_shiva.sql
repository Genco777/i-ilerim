CREATE TYPE "public"."ads_campaign_status" AS ENUM('enabled', 'paused', 'removed');--> statement-breakpoint
CREATE TYPE "public"."ads_campaign_type" AS ENUM('search', 'pmax', 'display', 'retargeting', 'local');--> statement-breakpoint
CREATE TYPE "public"."ads_draft_status" AS ENUM('collecting', 'awaiting_approval', 'confirmed', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "ads_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_campaign_id" text,
	"name" text NOT NULL,
	"type" "ads_campaign_type" NOT NULL,
	"status" "ads_campaign_status" DEFAULT 'paused' NOT NULL,
	"daily_budget_cents" integer NOT NULL,
	"target_url" text NOT NULL,
	"conversion_action" text,
	"start_date" text,
	"end_date" text,
	"created_via" text NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ads_campaigns_google_campaign_id_unique" UNIQUE("google_campaign_id")
);
--> statement-breakpoint
CREATE TABLE "ads_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "ads_draft_status" DEFAULT 'collecting' NOT NULL,
	"current_step" text DEFAULT 'type' NOT NULL,
	"draft_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_copy" jsonb,
	"generated_keywords" jsonb,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_preview_msg_id" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ads_preferences" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"daily_limit_cents" integer DEFAULT 5000 NOT NULL,
	"monthly_limit_cents" integer DEFAULT 100000 NOT NULL,
	"default_location_id" bigint DEFAULT 2276 NOT NULL,
	"default_language_code" text DEFAULT 'de' NOT NULL,
	"notify_anomaly_threshold_pct" integer DEFAULT 300 NOT NULL,
	"report_chat_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wizard_states" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ads_campaigns_chat_status_idx" ON "ads_campaigns" USING btree ("telegram_chat_id","status");--> statement-breakpoint
CREATE INDEX "ads_drafts_chat_status_idx" ON "ads_drafts" USING btree ("telegram_chat_id","status");