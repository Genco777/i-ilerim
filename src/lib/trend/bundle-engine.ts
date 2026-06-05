/**
 * B2 — Bundle Engine
 *
 * Triggered after every product approval. Logic:
 *   1. Check if there are ≥1 other APPROVED products in the same niche.
 *   2. If yes, build a bundle of 2-3 products (most recent in niche).
 *   3. Pricing: 30% off the sum of individual prices, rounded to €0.50.
 *   4. Create Stripe Product + Price for the bundle.
 *   5. Insert product_bundles row, public to shop.
 *
 * Idempotency: per-niche we only have 1 active bundle at a time. If a new
 * product approval would create a duplicate niche-bundle, we update the
 * existing one to include the new product (up to 5 items).
 *
 * Use case: buyer browsing /shop/<planner-slug> sees "Get the full 3-pack
 * for €5.99 (save 30%)" upsell — boosts AOV from €2.99 to €5.99.
 */

import { db } from '@/lib/db';
import { products, productBundles, niches } from '@/lib/db/schema';
import { and, eq, isNotNull, desc } from 'drizzle-orm';
import { getStripe } from '@/lib/stripe/client';

const MIN_BUNDLE_SIZE = 2;
const MAX_BUNDLE_SIZE = 5;
const DEFAULT_DISCOUNT_PCT = 30;

/**
 * Build / refresh the bundle for a niche after a new product approval.
 * Returns the bundle ID if a bundle was created / updated; null if not
 * enough products yet.
 */
export async function refreshBundleForNiche(
  nicheId: string,
): Promise<string | null> {
  // 1. Pull niche metadata for the bundle name
  const nicheRows = await db
    .select()
    .from(niches)
    .where(eq(niches.id, nicheId))
    .limit(1);
  const niche = nicheRows[0];
  if (!niche) return null;

  // 2. Pull all approved products for this niche (most recent first)
  const prodRows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.niche_id, nicheId),
        isNotNull(products.approved_at),
        eq(products.is_public_in_shop, 1),
      ),
    )
    .orderBy(desc(products.approved_at));

  if (prodRows.length < MIN_BUNDLE_SIZE) {
    return null; // not enough products to form a bundle
  }

  const pickedProducts = prodRows.slice(0, MAX_BUNDLE_SIZE);
  const productIds = pickedProducts.map((p) => p.id);
  const sumPriceCents = pickedProducts.reduce(
    (acc, p) => acc + p.price_cents,
    0,
  );

  // Round bundle price to nearest €0.50 below the sum × (1 - discount)
  const rawBundlePrice = sumPriceCents * (1 - DEFAULT_DISCOUNT_PCT / 100);
  const bundlePriceCents = Math.round(rawBundlePrice / 50) * 50;

  // 3. Check if a bundle for this niche already exists
  const existing = await db
    .select()
    .from(productBundles)
    .where(
      and(
        eq(productBundles.niche_id, nicheId),
        eq(productBundles.is_active, 1),
      ),
    )
    .limit(1);

  const heroUrl = pickedProducts[0]?.hero_image_url ?? null;
  const bundleSlug = `${niche.topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}-bundle`;

  const niceName = `${niche.topic} — ${pickedProducts.length}-Pack Bundle`;
  const description = `Bundle of ${pickedProducts.length} curated printable products from the ${niche.topic} collection. Save ${DEFAULT_DISCOUNT_PCT}% vs buying individually. Instant download, lifetime updates.`;

  if (existing[0]) {
    // Update existing bundle (new product added)
    await db
      .update(productBundles)
      .set({
        product_ids: productIds,
        sum_price_cents: sumPriceCents,
        bundle_price_cents: bundlePriceCents,
        hero_image_url: heroUrl,
        name: niceName,
        description,
        updated_at: new Date(),
      })
      .where(eq(productBundles.id, existing[0].id));

    // Stripe Price IDs are immutable — if bundle price changed, leave it
    // for the cron to clean up (next ensureBundleStripe call replaces it).
    return existing[0].id;
  }

  // Insert new bundle
  const inserted = await db
    .insert(productBundles)
    .values({
      slug: bundleSlug,
      name: niceName,
      description,
      niche_id: nicheId,
      product_ids: productIds,
      sum_price_cents: sumPriceCents,
      bundle_price_cents: bundlePriceCents,
      discount_percent: DEFAULT_DISCOUNT_PCT,
      hero_image_url: heroUrl,
      is_active: 1,
      is_public_in_shop: 1,
    })
    .returning({ id: productBundles.id });

  return inserted[0]?.id ?? null;
}

/**
 * Create Stripe Product + Price for a bundle (idempotent).
 * Called separately from the approval flow — on first checkout attempt
 * the API route checks if Stripe IDs exist; if not, calls this.
 */
export async function ensureBundleStripe(bundleId: string): Promise<{
  stripeProductId: string;
  stripePriceId: string;
}> {
  const rows = await db
    .select()
    .from(productBundles)
    .where(eq(productBundles.id, bundleId))
    .limit(1);
  const b = rows[0];
  if (!b) throw new Error(`Bundle ${bundleId} not found`);

  if (b.stripe_product_id && b.stripe_price_id) {
    return {
      stripeProductId: b.stripe_product_id,
      stripePriceId: b.stripe_price_id,
    };
  }

  const stripe = getStripe();

  const stripeProduct = await stripe.products.create({
    name: b.name.slice(0, 250),
    description: b.description.slice(0, 500),
    images: b.hero_image_url ? [b.hero_image_url] : undefined,
    metadata: { bundle_id: b.id, slug: b.slug },
    tax_code: 'txcd_10000000',
    shippable: false,
  });

  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    currency: 'eur',
    unit_amount: b.bundle_price_cents,
    tax_behavior: 'inclusive',
    nickname: 'Bundle',
    metadata: { bundle_id: b.id },
  });

  await db
    .update(productBundles)
    .set({
      stripe_product_id: stripeProduct.id,
      stripe_price_id: stripePrice.id,
      updated_at: new Date(),
    })
    .where(eq(productBundles.id, b.id));

  return {
    stripeProductId: stripeProduct.id,
    stripePriceId: stripePrice.id,
  };
}
