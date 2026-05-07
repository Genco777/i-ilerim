CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TYPE "public"."image_source" AS ENUM('ai_generated', 'manual_upload', 'raw_no_processing');--> statement-breakpoint
CREATE TYPE "public"."message_platform" AS ENUM('fb_comment', 'fb_dm', 'ig_comment', 'ig_dm', 'wa_message');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('new', 'drafting', 'awaiting_approval', 'replied', 'ignored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'scheduled', 'publishing', 'published', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "brand_kit" (
	"id" integer PRIMARY KEY NOT NULL,
	"logo_url" text,
	"logo_position" text DEFAULT 'bottom_right' NOT NULL,
	"logo_size_pct" real DEFAULT 18 NOT NULL,
	"logo_opacity" real DEFAULT 0.85 NOT NULL,
	"logo_padding_px" integer DEFAULT 40 NOT NULL,
	"manual_upload_logo_default" text DEFAULT 'ask' NOT NULL,
	"brand_colors" jsonb DEFAULT '["#050912","#d4a43a"]'::jsonb NOT NULL,
	"visual_style_guide" text NOT NULL,
	"text_tone_guide" text NOT NULL,
	"negative_words" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"topic" text,
	"text_de" text NOT NULL,
	"hashtags" text[] DEFAULT '{}',
	"image_source" "image_source" NOT NULL,
	"raw_image_url" text,
	"final_image_url" text NOT NULL,
	"image_prompt" text,
	"image_provider" text,
	"style_overrides" jsonb DEFAULT '{}'::jsonb,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"fb_post_id" text,
	"ig_post_id" text,
	"ig_shortcode" text,
	"error_log" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_via" text NOT NULL,
	"telegram_chat_id" text,
	"telegram_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" "bytea" NOT NULL,
	"expires_at" timestamp with time zone,
	"rotation_status" text DEFAULT 'healthy' NOT NULL,
	"last_refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"update_id" integer,
	"action" text NOT NULL,
	"user_id" integer NOT NULL,
	"result" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_actions_update_id_unique" UNIQUE("update_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;