ALTER TABLE "mail_inbox" ADD COLUMN "folder" text NOT NULL DEFAULT 'INBOX';--> statement-breakpoint
ALTER TABLE "mail_inbox" DROP CONSTRAINT IF EXISTS "mail_inbox_uid_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "mail_inbox_uid_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_inbox_folder_uid_idx" ON "mail_inbox" ("folder", "uid");
