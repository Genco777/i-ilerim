-- Faz 3 — Stripe Shop tabloları
-- Bu migration'ı Neon Console'da yapıştır + Run (drizzle-kit sandbox'tan çalışmıyor).

DO $$ BEGIN
  CREATE TYPE "channel_kind" AS ENUM (
    'stripe_shop', 'etsy', 'pinterest', 'instagram', 'facebook'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Sales ──
CREATE TABLE IF NOT EXISTS "product_sales" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid REFERENCES "products"("id"),
  "channel" "channel_kind" NOT NULL,
  "external_order_id" text,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'eur',
  "buyer_email" text,
  "buyer_country" text,
  "sold_at" timestamp with time zone NOT NULL DEFAULT now(),
  "raw_payload" jsonb
);

CREATE INDEX IF NOT EXISTS "sales_product_idx" ON "product_sales" ("product_id");
CREATE INDEX IF NOT EXISTS "sales_sold_at_idx" ON "product_sales" ("sold_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_external_order_uniq" ON "product_sales" ("external_order_id");

-- ── Download tokens ──
CREATE TABLE IF NOT EXISTS "download_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL UNIQUE,
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "sale_id" uuid REFERENCES "product_sales"("id"),
  "buyer_email" text,
  "expires_at" timestamp with time zone NOT NULL,
  "used_count" integer NOT NULL DEFAULT 0,
  "max_uses" integer NOT NULL DEFAULT 5,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "download_token_uniq" ON "download_tokens" ("token");

-- ── Channel listings (Faz 3 sadece stripe_shop kullanır; Faz 4 Pinterest/Meta) ──
CREATE TABLE IF NOT EXISTS "product_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL REFERENCES "products"("id"),
  "channel" "channel_kind" NOT NULL,
  "external_id" text,
  "external_url" text,
  "status" text NOT NULL DEFAULT 'pending',
  "error_log" text,
  "published_at" timestamp with time zone,
  CONSTRAINT "uniq_product_channel" UNIQUE ("product_id", "channel")
);

SELECT 'OK — Faz 3 tabloları hazır' AS sonuc,
       (SELECT count(*) FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN ('product_sales', 'download_tokens', 'product_listings')) AS table_count;
