-- B2 — Bundle Engine + C2 — Cart Abandon
--
-- B2: auto-bundled 2-3 product sets created on every new product approval.
-- C2: 3-email drip sequence triggered by Stripe checkout.session.expired.

CREATE TABLE IF NOT EXISTS product_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  niche_id UUID REFERENCES niches(id),
  product_ids TEXT[] NOT NULL DEFAULT '{}',
  sum_price_cents INTEGER NOT NULL,
  bundle_price_cents INTEGER NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 30,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_public_in_shop INTEGER NOT NULL DEFAULT 1,
  hero_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bundles_niche_idx ON product_bundles(niche_id);
CREATE INDEX IF NOT EXISTS bundles_slug_idx ON product_bundles(slug);

CREATE TABLE IF NOT EXISTS cart_abandons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  product_id UUID REFERENCES products(id),
  product_slug TEXT,
  bundle_id UUID REFERENCES product_bundles(id),
  stripe_session_id TEXT NOT NULL UNIQUE,
  abandoned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_1_sent_at TIMESTAMPTZ,
  email_2_sent_at TIMESTAMPTZ,
  email_3_sent_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ,
  recovered_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cart_abandon_email_idx ON cart_abandons(customer_email);
CREATE INDEX IF NOT EXISTS cart_abandon_session_idx ON cart_abandons(stripe_session_id);
CREATE INDEX IF NOT EXISTS cart_abandon_pending_idx ON cart_abandons(abandoned_at);
