/**
 * Stripe Products + Prices sync.
 *
 * When a product is approved in Telegram (status='approved'), we mirror it
 * to Stripe so checkout sessions can reference a stable price ID. We store
 * the Stripe IDs on our products row.
 *
 * Idempotent: re-calling for the same product returns the existing IDs.
 */

import { getStripe } from './client';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface StripeProductRefs {
  productId: string;
  priceId: string;
}

/**
 * Creates (or returns existing) Stripe Product + Price for a trend-engine
 * product row. Marks our products row with is_public_in_shop=1 so the shop
 * page lists it.
 */
export async function ensureStripeProduct(productRowId: string): Promise<StripeProductRefs> {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productRowId))
    .limit(1);
  const p = rows[0];
  if (!p) throw new Error(`Product ${productRowId} not found`);

  // Already synced? Reuse.
  if (p.stripe_product_id && p.stripe_price_id) {
    return { productId: p.stripe_product_id, priceId: p.stripe_price_id };
  }

  if (!p.slug || !p.shop_title || !p.shop_description) {
    throw new Error(
      `Product ${productRowId} missing required shop fields (slug/title/description)`,
    );
  }

  const stripe = getStripe();

  // ── Create Stripe Product ──
  // images: we send the hero (Stripe accepts up to 8); avoid mockups so the
  // checkout shows the pristine product image, not a styled scene.
  const stripeProduct = await stripe.products.create({
    name: p.shop_title.slice(0, 250),
    description: p.shop_description.slice(0, 500),
    images: p.hero_image_url ? [p.hero_image_url] : undefined,
    metadata: {
      trend_product_id: p.id,
      slug: p.slug,
      product_type: p.type,
    },
    tax_code: 'txcd_10000000', // "General — services" (Kleinunternehmer: tax handled separately)
    shippable: false,
  });

  // ── Create one-time Price in EUR — Basic tier ──
  const stripePrice = await stripe.prices.create({
    product: stripeProduct.id,
    currency: 'eur',
    unit_amount: p.price_cents,
    metadata: { trend_product_id: p.id, tier: 'basic' },
    // Kleinunternehmer: we don't add VAT, so prices are gross (= net for §19)
    tax_behavior: 'inclusive',
    nickname: 'Basic',
  });

  // B1 — Plus + Pro tiers (best-effort; if either fails the Basic still works)
  let stripePriceBId: string | null = null;
  let stripePriceCId: string | null = null;
  if (p.tier_b_price_cents) {
    try {
      const priceB = await stripe.prices.create({
        product: stripeProduct.id,
        currency: 'eur',
        unit_amount: p.tier_b_price_cents,
        metadata: { trend_product_id: p.id, tier: 'plus' },
        tax_behavior: 'inclusive',
        nickname: 'Plus',
      });
      stripePriceBId = priceB.id;
    } catch (e) {
      console.error('[stripe] tier B price create failed (continuing)', e);
    }
  }
  if (p.tier_c_price_cents) {
    try {
      const priceC = await stripe.prices.create({
        product: stripeProduct.id,
        currency: 'eur',
        unit_amount: p.tier_c_price_cents,
        metadata: { trend_product_id: p.id, tier: 'pro' },
        tax_behavior: 'inclusive',
        nickname: 'Pro',
      });
      stripePriceCId = priceC.id;
    } catch (e) {
      console.error('[stripe] tier C price create failed (continuing)', e);
    }
  }

  await db
    .update(products)
    .set({
      stripe_product_id: stripeProduct.id,
      stripe_price_id: stripePrice.id,
      stripe_price_b_id: stripePriceBId,
      stripe_price_c_id: stripePriceCId,
      is_public_in_shop: 1,
      updated_at: new Date(),
    })
    .where(eq(products.id, p.id));

  return { productId: stripeProduct.id, priceId: stripePrice.id };
}

/**
 * Removes a product from the public shop listing without deleting Stripe
 * resources (so historical payments still resolve). Used when a product is
 * archived or rejected post-approval.
 */
export async function unlistFromShop(productRowId: string): Promise<void> {
  await db
    .update(products)
    .set({ is_public_in_shop: 0, updated_at: new Date() })
    .where(eq(products.id, productRowId));
}
