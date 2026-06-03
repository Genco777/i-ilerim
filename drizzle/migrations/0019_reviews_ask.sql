-- Migration 0019 — P1.6 Reviews automation
-- Adds review_ask_sent_at column to product_sales so the daily reviews-ask
-- cron knows which buyers have already been emailed.

ALTER TABLE product_sales
  ADD COLUMN IF NOT EXISTS review_ask_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS sales_review_due_idx ON product_sales (sold_at);
