-- Sprint I — Editable Canva tier columns on products table.
--
-- Adds 4 columns for the new "Editable Canva" tier (uses existing
-- tier_c_price_cents slot for pricing, default €9.99).
--
-- Each trend product gets a Canva master design generated alongside the
-- PDF; the share URL + instructions PDF + preview image are persisted
-- here for later Etsy upload and Stripe checkout delivery.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS editable_canva_design_id text,
  ADD COLUMN IF NOT EXISTS editable_canva_share_url text,
  ADD COLUMN IF NOT EXISTS editable_instructions_pdf_url text,
  ADD COLUMN IF NOT EXISTS editable_preview_image_url text;

-- Backfill default €9.99 (999 cents) for tier_c_price_cents where null.
-- Existing products without tier_c set will auto-get Editable pricing
-- once their Canva master is generated.
UPDATE products
  SET tier_c_price_cents = 999
WHERE tier_c_price_cents IS NULL AND price_cents IS NOT NULL;
