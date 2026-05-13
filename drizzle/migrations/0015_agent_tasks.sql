CREATE TYPE "agent_task_status" AS ENUM ('pending', 'claimed', 'running', 'completed', 'failed');

CREATE TABLE "agent_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_type" text NOT NULL,
  "title" text NOT NULL,
  "payload" jsonb DEFAULT '{}',
  "status" "agent_task_status" NOT NULL DEFAULT 'pending',
  "priority" integer DEFAULT 5,
  "claimed_by" text,
  "claimed_at" timestamp with time zone,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone
);

CREATE INDEX "task_status_idx" ON "agent_tasks" ("status");
CREATE INDEX "task_type_idx" ON "agent_tasks" ("task_type");
CREATE INDEX "task_pending_priority_idx" ON "agent_tasks" ("priority" DESC);
