-- Sprint K Faz 6 — Apparel candidates (daily cron, Telegram approval flow)
CREATE TABLE IF NOT EXISTS "apparel_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cron_run_id" text,
  "niche" text NOT NULL,
  "slogan" text NOT NULL,
  "theme" text NOT NULL,
  "style" text NOT NULL,
  "demand_hint" text,
  "inspired_by" text,
  "printify_product_id" text NOT NULL,
  "printify_preview_url" text,
  "etsy_listing_id" text,
  "status" text NOT NULL DEFAULT 'pending',
  "error_log" text,
  "decided_at" timestamp with time zone,
  "decided_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "apparel_candidate_status_idx" ON "apparel_candidates"("status");
CREATE INDEX IF NOT EXISTS "apparel_candidate_cron_idx" ON "apparel_candidates"("cron_run_id");
CREATE INDEX IF NOT EXISTS "apparel_candidate_created_idx" ON "apparel_candidates"("created_at");
