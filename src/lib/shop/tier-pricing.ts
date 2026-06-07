/**
 * Sprint I — 3-Tier Product Pricing (single source of truth)
 *
 * Maps the historical DB tier slots onto the Sprint I product nomenclature:
 *
 *   DB column                    → Sprint I tier      → Default price
 *   --------------------------------------------------------------
 *   price_cents                  → 'basic'            → €2.99
 *   tier_b_price_cents           → 'pro'              → €4.99
 *   tier_c_price_cents           → 'editable'         → €9.99
 *
 *   stripe_price_id              → basic price ref
 *   stripe_price_b_id            → pro price ref
 *   stripe_price_c_id            → editable price ref
 *
 * Both the checkout API (`src/app/api/shop/checkout/route.ts`) and the shop
 * UI consume this module so tier metadata never drifts between them.
 *
 * Public surface:
 *   - computeTiersForProduct(product)        — builds the 3 TierDef cards
 *   - buildCheckoutMetadata(p, tier, extras) — Stripe checkout.session metadata
 *   - ensureStripePriceForTier(productId, t) — lazy Stripe Price create
 *   - DEFAULT_PRICES                          — fallback price table
 *   - TierKey / TierDef / CheckoutMetadata    — types
 *
 * Currency: EUR hardcoded (Kleinunternehmer §19 UStG, German market).
 * Multi-currency is a Sprint J concern.
 */

import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getStripe } from '@/lib/stripe/client';
import type { Product } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TierKey = 'basic' | 'pro' | 'editable';

export interface TierDef {
  /** Internal tier key — wire-level identifier shared with Stripe metadata. */
  key: TierKey;
  /** Human label shown in the shop UI (English, no i18n yet). */
  label: string;
  /** Short subtitle below the tier label. */
  shortDescription: string;
  /** "What you get" bullet list (English). */
  bulletPoints: string[];
  /** Effective price for this product+tier, in EUR cents. */
  priceCents: number;
  /** Stripe Price ID if already created on stripe.com, else null. */
  stripePriceId: string | null;
  /** Whether the tier can actually be purchased for this product right now. */
  available: boolean;
  /** Primary deliverable URL for the tier (digital_file / instructions_pdf). */
  assetUrl: string | null;
  /** If true the UI should visually flag this tier as the recommended pick. */
  highlight?: boolean;
}

export interface CheckoutMetadata {
  trend_product_id: string;
  tier: TierKey;
  product_slug?: string;
  custom_name?: string;
  custom_date?: string;
  // Additional ad-hoc keys may be appended by the route layer. Stripe limit:
  // max 50 keys, each value <=500 chars. We enforce per-value clipping below.
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default prices used when a new product is inserted without explicit values. */
export const DEFAULT_PRICES: Record<TierKey, number> = {
  basic: 299,     // €2.99
  pro: 499,       // €4.99
  editable: 999,  // €9.99
};

/** Stripe metadata hard limits — used to clip user-supplied values. */
const STRIPE_METADATA_VALUE_MAX = 500;
const STRIPE_METADATA_KEY_MAX = 50;

const TIER_LABEL: Record<TierKey, string> = {
  basic: 'Basic PDF',
  pro: 'Personalized Pro',
  editable: 'Editable Canva',
};

const TIER_SHORT_DESCRIPTION: Record<TierKey, string> = {
  basic: 'Instant PDF, ready to print',
  pro: 'Your name & date printed on it',
  editable: 'Full Canva template you can edit forever',
};

const TIER_BULLETS: Record<TierKey, readonly string[]> = {
  basic: [
    'Instant PDF download',
    'Print at home',
    'High-res, ready to use',
  ],
  pro: [
    'Everything in Basic',
    'Your name & date printed on it',
    'Personalized PDF delivered in minutes',
  ],
  editable: [
    'Everything in Pro',
    'Full Canva template — edit colors, text, images',
    'Free Canva account works',
    'Use it for unlimited prints',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clipMetadataValue(v: string): string {
  if (v.length <= STRIPE_METADATA_VALUE_MAX) return v;
  return v.slice(0, STRIPE_METADATA_VALUE_MAX);
}

function priceForTier(product: Product, tier: TierKey): number {
  switch (tier) {
    case 'basic':
      return product.price_cents ?? DEFAULT_PRICES.basic;
    case 'pro':
      return product.tier_b_price_cents ?? DEFAULT_PRICES.pro;
    case 'editable':
      return product.tier_c_price_cents ?? DEFAULT_PRICES.editable;
  }
}

function stripePriceIdForTier(product: Product, tier: TierKey): string | null {
  switch (tier) {
    case 'basic':
      return product.stripe_price_id ?? null;
    case 'pro':
      return product.stripe_price_b_id ?? null;
    case 'editable':
      return product.stripe_price_c_id ?? null;
  }
}

function availabilityForTier(product: Product, tier: TierKey): boolean {
  switch (tier) {
    case 'basic':
      // Basic requires the digital PDF asset itself.
      return Boolean(product.digital_file_url);
    case 'pro':
      // Pro = Basic PDF + runtime overlay. Same asset prerequisite as Basic.
      return Boolean(product.digital_file_url);
    case 'editable':
      // Editable is gated on the Canva share URL existing. Instructions PDF is
      // strongly recommended but the Canva URL is the load-bearing asset.
      return Boolean(product.editable_canva_share_url);
  }
}

function assetUrlForTier(product: Product, tier: TierKey): string | null {
  switch (tier) {
    case 'basic':
      return product.digital_file_url ?? null;
    case 'pro':
      // The Pro deliverable is generated at sale time by
      // `personalizeProductPdf`. There is no static URL to advertise.
      return null;
    case 'editable':
      return product.editable_instructions_pdf_url ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute all 3 tier definitions for a given product row.
 *
 * Unavailable tiers (missing asset prerequisites) are still returned so the
 * UI can render them as grayed-out cards. The caller decides whether to hide
 * them entirely.
 *
 * The `pro` tier is flagged as highlighted (recommended) — but only when it
 * is actually available; otherwise we don't push a tier the buyer can't pick.
 */
export function computeTiersForProduct(product: Product): TierDef[] {
  const tiers: TierKey[] = ['basic', 'pro', 'editable'];

  return tiers.map((key): TierDef => {
    const available = availabilityForTier(product, key);
    const highlight = key === 'pro' && available;

    return {
      key,
      label: TIER_LABEL[key],
      shortDescription: TIER_SHORT_DESCRIPTION[key],
      bulletPoints: [...TIER_BULLETS[key]],
      priceCents: priceForTier(product, key),
      stripePriceId: stripePriceIdForTier(product, key),
      available,
      assetUrl: assetUrlForTier(product, key),
      ...(highlight ? { highlight: true } : {}),
    };
  });
}

/**
 * Build the Stripe `checkout.session.metadata` payload for a given tier.
 *
 * - Always includes `trend_product_id` + `tier` (load-bearing for webhook).
 * - Includes `product_slug` when present (for buyer-facing emails / logs).
 * - `customName` / `customDate` are only attached for the `pro` tier; they
 *   are otherwise ignored to keep the metadata blob lean.
 * - Each value is clipped to Stripe's 500-char limit.
 *
 * Stripe metadata allows up to 50 keys; this function emits at most 5.
 */
export function buildCheckoutMetadata(
  product: Product,
  tier: TierKey,
  extras?: { customName?: string | null; customDate?: string | null },
): Record<string, string> {
  const out: Record<string, string> = {
    trend_product_id: product.id,
    tier,
  };

  if (product.slug) {
    out.product_slug = clipMetadataValue(product.slug);
  }

  if (tier === 'pro') {
    const name = extras?.customName?.trim();
    const date = extras?.customDate?.trim();
    if (name) out.custom_name = clipMetadataValue(name.slice(0, 40));
    if (date) out.custom_date = clipMetadataValue(date.slice(0, 30));
  }

  // Defensive: enforce Stripe's 50-key cap (we never approach this but the
  // explicit guard documents the constraint for future contributors).
  const keys = Object.keys(out);
  if (keys.length > STRIPE_METADATA_KEY_MAX) {
    const trimmed: Record<string, string> = {};
    for (const k of keys.slice(0, STRIPE_METADATA_KEY_MAX)) {
      // Safe: k comes from Object.keys(out) so out[k] is guaranteed to exist.
      // noUncheckedIndexedAccess requires this non-null assertion.
      trimmed[k] = out[k]!;
    }
    return trimmed;
  }
  return out;
}

/**
 * Ensure a Stripe Price exists for the given (product, tier). If the product
 * row already has the relevant `stripe_price_*_id` set, that ID is returned
 * untouched. Otherwise a new Stripe Price is created against the existing
 * Stripe Product and the ID is persisted back to the DB.
 *
 * Race safety: we use a "select → create → conditional update" pattern. If a
 * concurrent request wins and persists its Price ID first, our UPDATE will be
 * a no-op (WHERE clause requires the column to still be NULL) and we re-read
 * the winning value. The orphaned Stripe Price created by the loser is
 * harmless (it just sits unused on Stripe — same trade-off as
 * `ensureStripeProduct`).
 *
 * Requires that `ensureStripeProduct` has already been called so the product
 * row has a `stripe_product_id`. Throws if not.
 */
export async function ensureStripePriceForTier(
  productId: string,
  tier: TierKey,
): Promise<string> {
  // ── 1. Read current state ──
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const product = rows[0];
  if (!product) {
    throw new Error(`ensureStripePriceForTier: product ${productId} not found`);
  }
  if (!product.stripe_product_id) {
    throw new Error(
      `ensureStripePriceForTier: product ${productId} has no stripe_product_id ` +
        `(call ensureStripeProduct first)`,
    );
  }

  const existing = stripePriceIdForTier(product, tier);
  if (existing) return existing;

  // ── 2. Create Stripe Price ──
  const stripe = getStripe();
  const unitAmount = priceForTier(product, tier);
  const nickname =
    tier === 'basic' ? 'Basic' : tier === 'pro' ? 'Pro' : 'Editable';

  const price = await stripe.prices.create({
    product: product.stripe_product_id,
    currency: 'eur',
    unit_amount: unitAmount,
    // Kleinunternehmer §19 UStG: prices are gross-equals-net, no VAT layered on.
    // Mirrors `ensureStripeProduct` in src/lib/stripe/products.ts.
    tax_behavior: 'inclusive',
    nickname,
    metadata: { trend_product_id: productId, tier },
  });

  // ── 3. Persist (race-safe: only write if column is still NULL) ──
  // If a concurrent caller won, our update affects 0 rows; we re-read and
  // return their winning ID so callers see a consistent result.
  const column =
    tier === 'basic'
      ? products.stripe_price_id
      : tier === 'pro'
        ? products.stripe_price_b_id
        : products.stripe_price_c_id;

  await db
    .update(products)
    .set({
      ...(tier === 'basic' ? { stripe_price_id: price.id } : {}),
      ...(tier === 'pro' ? { stripe_price_b_id: price.id } : {}),
      ...(tier === 'editable' ? { stripe_price_c_id: price.id } : {}),
      updated_at: new Date(),
    })
    .where(and(eq(products.id, productId), isNull(column)));

  // Re-read to discover whether we won the race or a concurrent caller did.
  const afterRows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const after = afterRows[0];
  const winningId = after ? stripePriceIdForTier(after, tier) : null;
  // Fall back to our own freshly-created price.id if the re-read somehow
  // returned nothing (extreme edge case — product deleted mid-flight).
  return winningId ?? price.id;
}
