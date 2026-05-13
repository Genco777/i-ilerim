ALTER TYPE "public"."invoice_status" ADD VALUE 'converted';--> statement-breakpoint
ALTER TYPE "public"."invoice_type" ADD VALUE 'angebot';--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"title" text,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "converted_to_invoice_id" text;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conv_chat_idx" ON "chat_conversations" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "chat_conv_updated_idx" ON "chat_conversations" USING btree ("telegram_chat_id","updated_at");--> statement-breakpoint
CREATE INDEX "chat_msg_conv_idx" ON "chat_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "chat_msg_conv_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at");