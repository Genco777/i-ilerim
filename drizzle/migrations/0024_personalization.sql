-- Sprint G — Personalization Pro Tier
--
-- Adds custom_name / custom_date / personalized_file_url columns to product_sales.
-- When a buyer picks the Pro tier and enters a name/date, the Stripe webhook
-- triggers regeneration of the cover with a Sharp text overlay, uploads as a
-- new file, and emails the buyer the personalized version.

ALTER TABLE product_sales
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS custom_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_date TEXT,
  ADD COLUMN IF NOT EXISTS personalized_file_url TEXT,
  ADD COLUMN IF NOT EXISTS personalized_at TIMESTAMPTZ;
