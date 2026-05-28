CREATE TYPE "product_type" AS ENUM ('planner', 'poster', 'sticker', 'template', 'social_template');

CREATE TYPE "product_status" AS ENUM ('draft', 'awaiting_approval', 'approved', 'published', 'rejected', 'failed');

CREATE TYPE "competition_level" AS ENUM ('low', 'medium', 'high');

CREATE TABLE "niches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "topic" text NOT NULL,
  "gap_angle" text NOT NULL,
  "score" real NOT NULL,
  "competition" "competition_level" DEFAULT 'medium' NOT NULL,
  "source_signals" jsonb DEFAULT '[]',
  "raw_analysis" jsonb DEFAULT '{}',
  "used_in_product_id" uuid,
  "discovered_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "niche_score_idx" ON "niches" ("score" DESC);
CREATE INDEX "niche_discovered_idx" ON "niches" ("discovered_at" DESC);

CREATE TABLE "products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "niche_id" uuid REFERENCES "niches"("id"),
  "type" "product_type" NOT NULL,
  "status" "product_status" DEFAULT 'draft' NOT NULL,
  "slug" text UNIQUE,
  "etsy_title" text,
  "etsy_description" text,
  "tags" text[] DEFAULT '{}',
  "shop_title" text,
  "shop_description" text,
  "price_cents" integer NOT NULL,
  "stripe_product_id" text,
  "stripe_price_id" text,
  "hero_image_url" text,
  "mockup_image_urls" text[] DEFAULT '{}',
  "digital_file_url" text,
  "digital_file_size_bytes" bigint,
  "telegram_approval_chat_id" text,
  "telegram_approval_msg_id" text,
  "approved_at" timestamp with time zone,
  "rejected_reason" text,
  "is_public_in_shop" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "product_status_idx" ON "products" ("status");
CREATE INDEX "product_niche_idx" ON "products" ("niche_id");
CREATE INDEX "product_slug_idx" ON "products" ("slug");

CREATE TABLE "niche_performance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "niche_topic" text NOT NULL UNIQUE,
  "product_count" integer DEFAULT 0 NOT NULL,
  "total_sales" integer DEFAULT 0 NOT NULL,
  "total_revenue_cents" integer DEFAULT 0 NOT NULL,
  "avg_score_boost" real DEFAULT 0 NOT NULL,
  "last_sale_at" timestamp with time zone,
  "computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
