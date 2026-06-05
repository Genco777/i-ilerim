-- Migration 0020 — B1: Tier pricing variations (Basic/Plus/Pro)
-- Adds Plus + Pro tier columns. Basic stays as price_cents.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tier_b_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tier_b_description TEXT,
  ADD COLUMN IF NOT EXISTS tier_c_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tier_c_description TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_b_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_c_id TEXT;
