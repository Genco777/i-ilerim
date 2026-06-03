/**
 * POST /api/shop/checkout
 *
 * Creates a Stripe Checkout Session for a product slug and redirects the
 * buyer to Stripe's hosted checkout page. The session metadata carries
 * trend_product_id so the webhook can match the sale back to our row.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStripe, getShopBaseUrl } from '@/lib/stripe/client';
import { ensureStripeProduct } from '@/lib/stripe/products';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  let slug: string | null = null;
  try {
    const body = (await req.json()) as { slug?: string };
    slug = body.slug ?? null;
  } catch {
    /* allow form posts too */
  }

  // Form-encoded fallback (HTML form with no JS)
  if (!slug) {
    try {
      const fd = await req.formData();
      const s = fd.get('slug');
      if (typeof s === 'string') slug = s;
    } catch {
      /* empty body */
    }
  }

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
    // Collect minimum data — we only need email for delivery
    customer_email: undefined, // Stripe will ask for it
    billing_address_collection: 'required', // needed for buyer_country (KDV/OSS)
    locale: 'auto',
    metadata: {
      trend_product_id: product.id,
      product_slug: product.slug ?? '',
    },
    // Kleinunternehmer §19 — no tax to add; price is gross/net
    automatic_tax: { enabled: false },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return checkout URL' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
