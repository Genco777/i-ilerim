/**
 * POST /api/shop/checkout
 *
 * Creates a Stripe Checkout Session for a product slug and redirects the
 * buyer to Stripe's hosted checkout page. The session metadata carries
 * trend_product_id so the webhook can match the sale back to our row.
 *
 * Accepts both JSON ({slug:"..."}) and form-encoded posts. Reads the body
 * exactly once based on Content-Type — Request body is a one-shot stream.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStripe, getShopBaseUrl } from '@/lib/stripe/client';
import { ensureStripeProduct } from '@/lib/stripe/products';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function extractInput(req: Request): Promise<{ slug: string | null; tier: 'basic' | 'plus' | 'pro' }> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  let slug: string | null = null;
  let tier: 'basic' | 'plus' | 'pro' = 'basic';

  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { slug?: unknown; tier?: unknown };
      if (typeof body.slug === 'string' && body.slug.length > 0) slug = body.slug;
      if (body.tier === 'plus' || body.tier === 'pro') tier = body.tier;
      return { slug, tier };
    } catch {
      return { slug: null, tier };
    }
  }
  try {
    const fd = await req.formData();
    const s = fd.get('slug');
    const t = fd.get('tier');
    if (typeof s === 'string' && s.length > 0) slug = s;
    if (t === 'plus' || t === 'pro') tier = t;
    return { slug, tier };
  } catch {
    return { slug: null, tier };
  }
}

export async function POST(req: Request) {
  const { slug, tier } = await extractInput(req);

  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.is_public_in_shop, 1)))
    .limit(1);
  const product = rows[0];

  if (!product) {
    return NextResponse.json({ error: 'Product not found or not in shop' }, { status: 404 });
  }
  if (product.status !== 'approved' && product.status !== 'published') {
    return NextResponse.json({ error: 'Product not available' }, { status: 403 });
  }

  // Make sure Stripe Product + Prices exist (idempotent; creates Basic+Plus+Pro)
  const { priceId } = await ensureStripeProduct(product.id);

  // Re-fetch product so we see the freshly-stored tier price IDs
  const freshRows = await db.select().from(products).where(eq(products.id, product.id)).limit(1);
  const fresh = freshRows[0]!;

  // Pick the price for the requested tier (fallback to Basic if tier missing)
  let selectedPrice = priceId;
  if (tier === 'plus' && fresh.stripe_price_b_id) selectedPrice = fresh.stripe_price_b_id;
  else if (tier === 'pro' && fresh.stripe_price_c_id) selectedPrice = fresh.stripe_price_c_id;

  const base = getShopBaseUrl().replace(/\/+$/, '');
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: selectedPrice, quantity: 1 }],
    success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/${slug}?cancelled=1`,
    payment_method_types: ['card'],
    customer_email: undefined,
    billing_address_collection: 'required',
    locale: 'auto',
    metadata: {
      trend_product_id: product.id,
      product_slug: product.slug ?? '',
      tier,
    },
    automatic_tax: { enabled: false },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return checkout URL' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
