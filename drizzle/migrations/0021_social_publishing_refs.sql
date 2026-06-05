-- Sprint X.3 — Social media publishing references for products
--
-- Each approved product gets distributed across Etsy + Pinterest immediately,
-- then bundled into a daily IG/FB carousel post + IG story video. These
-- columns track which post IDs the product appears in (for de-dup + analytics).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ig_post_id TEXT,
  ADD COLUMN IF NOT EXISTS ig_story_post_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_post_id TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_pin_id TEXT,
  ADD COLUMN IF NOT EXISTS social_published_at TIMESTAMPTZ;
