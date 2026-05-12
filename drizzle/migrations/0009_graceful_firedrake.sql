CREATE TABLE "email_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_line" text NOT NULL,
	"concept_title" text NOT NULL,
	"campaign_type" text NOT NULL,
	"theme" text NOT NULL,
	"content_json" jsonb NOT NULL,
	"brevo_campaign_id" integer,
	"recipient_email" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "email_preferences" ALTER COLUMN "updated_at" SET NOT NULL;