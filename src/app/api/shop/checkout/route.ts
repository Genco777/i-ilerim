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

async function extractSlug(req: Request): Promise<string | null> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

  // JSON body
  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as { slug?: unknown };
      return typeof body.slug === 'string' && body.slug.length > 0 ? body.slug : null;
    } catch {
      return null;
    }
  }

  // HTML form (default) — application/x-www-form-urlencoded or multipart/form-data
  try {
    const fd = await req.formData();
    const s = fd.get('slug');
    return typeof s === 'string' && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const slug = await extractSlug(req);

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

  // Make sure Stripe Product + Price exist (idempotent)
  const { priceId } = await ensureStripeProduct(product.id);

  const base = getShopBaseUrl().replace(/\/+$/, '');
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/${slug}?cancelled=1`,
    payment_method_types: ['card', 'paypal'],
    customer_email: undefined,
    billing_address_collection: 'required',
    locale: 'auto',
    metadata: {
      trend_product_id: product.id,
      product_slug: product.slug ?? '',
    },
    automatic_tax: { enabled: false },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return checkout URL' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
