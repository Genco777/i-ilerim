-- C3 — A/B Title Test columns for products
--
-- Each product gets 3 title variants (original + 2 Claude-generated alternatives).
-- A weekly cron rotates the active variant on Etsy and tracks views. After 4
-- weeks of data, the cron locks in the winning variant.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS title_variant_b TEXT,
  ADD COLUMN IF NOT EXISTS title_variant_c TEXT,
  ADD COLUMN IF NOT EXISTS title_active_variant TEXT DEFAULT 'a',
  ADD COLUMN IF NOT EXISTS title_last_rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS title_variant_a_views INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS title_variant_b_views INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS title_variant_c_views INTEGER DEFAULT 0;
