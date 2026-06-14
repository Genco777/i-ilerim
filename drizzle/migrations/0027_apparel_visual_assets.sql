-- Sprint M3 — Visual upgrade: extra image URLs + video URL
ALTER TABLE "apparel_candidates"
  ADD COLUMN IF NOT EXISTS "flat_lay_url" text,
  ADD COLUMN IF NOT EXISTS "size_chart_url" text,
  ADD COLUMN IF NOT EXISTS "color_grid_url" text,
  ADD COLUMN IF NOT EXISTS "video_url" text;
