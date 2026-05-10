ALTER TABLE "mail_drafts" ADD COLUMN "in_reply_to_message_id" text;--> statement-breakpoint
ALTER TABLE "mail_drafts" ADD COLUMN "mail_references" text;--> statement-breakpoint
CREATE TABLE "mail_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"uid" integer NOT NULL,
	"message_id" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text,
	"body_preview" text,
	"received_at" timestamp with time zone NOT NULL,
	"replied_draft_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_inbox_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mail_inbox" ADD CONSTRAINT "mail_inbox_replied_draft_id_mail_drafts_id_fk" FOREIGN KEY ("replied_draft_id") REFERENCES "public"."mail_drafts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mail_inbox_uid_idx" ON "mail_inbox" ("uid");
