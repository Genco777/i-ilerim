DO $$ BEGIN
 CREATE TYPE "kleinanzeigen_thread_status" AS ENUM ('new', 'awaiting_action', 'awaiting_custom', 'awaiting_refinement', 'awaiting_gap_info', 'awaiting_image', 'drafting', 'sent', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "business_override_kind" AS ENUM ('offered', 'not_offered', 'note', 'tone', 'signature');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kleinanzeigen_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" text,
	"routing_token" text NOT NULL,
	"sender_address" text NOT NULL,
	"buyer_name" text,
	"listing_title" text,
	"raw_body" text NOT NULL,
	"ai_analysis" jsonb,
	"status" "kleinanzeigen_thread_status" NOT NULL DEFAULT 'new',
	"draft_reply" text,
	"final_reply" text,
	"pending_gap_topic" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_message_id" integer,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"sent_at" timestamp with time zone,
	CONSTRAINT "kleinanzeigen_threads_email_message_id_unique" UNIQUE("email_message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kleinanzeigen_threads_chat_status_idx" ON "kleinanzeigen_threads" ("telegram_chat_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_profile_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"kind" "business_override_kind" NOT NULL DEFAULT 'note',
	"origin" text NOT NULL DEFAULT 'telegram',
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "business_profile_overrides_topic_kind_unique" UNIQUE("topic","kind")
);
