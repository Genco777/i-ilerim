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
CREATE INDEX IF NOT EXISTS "incoming_messages_status_idx" ON "incoming_messages" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incoming_messages_received_at_idx" ON "incoming_messages" ("received_at");
