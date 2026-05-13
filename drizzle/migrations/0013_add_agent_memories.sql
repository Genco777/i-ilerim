CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"last_accessed" timestamp with time zone DEFAULT now() NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_memories_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "mem_category_idx" ON "agent_memories" USING btree ("category");--> statement-breakpoint
CREATE INDEX "mem_importance_idx" ON "agent_memories" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "mem_accessed_idx" ON "agent_memories" USING btree ("last_accessed");