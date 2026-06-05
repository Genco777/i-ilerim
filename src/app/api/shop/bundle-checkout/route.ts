/**
 * POST /api/shop/bundle-checkout
 *
 * Bundle checkout — analog of /api/shop/checkout but for a productBundles row.
 * Lazily ensures the bundle has Stripe Product + Price set, creates a 30-min
 * expiry checkout session, returns 303 to Stripe.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productBundles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getStripe, getShopBaseUrl } from '@/lib/stripe/client';
import { ensureBundleStripe } from '@/lib/trend/bundle-engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function extractSlug(req: Request): Promise<string | null> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const body = (await req.json()) as { slug?: unknown };
      return typeof body.slug === 'string' && body.slug.length > 0 ? body.slug : null;
    } catch {
      return null;
    }
  }
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
    .from(productBundles)
    .where(
      and(
        eq(productBundles.slug, slug),
        eq(productBundles.is_public_in_shop, 1),
        eq(productBundles.is_active, 1),
      ),
    )
    .limit(1);
  const bundle = rows[0];
  if (!bundle) {
    return NextResponse.json({ error: 'Bundle not found' }, { status: 404 });
  }

  // Ensure Stripe Product+Price exist
  const { stripePriceId } = await ensureBundleStripe(bundle.id);

  const base = getShopBaseUrl().replace(/\/+$/, '');
  const stripe = getStripe();
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/bundle/${slug}?cancelled=1`,
    payment_method_types: ['card'],
    billing_address_collection: 'required',
    locale: 'auto',
    metadata: {
      bundle_id: bundle.id,
      bundle_slug: bundle.slug,
    },
    automatic_tax: { enabled: false },
    expires_at: expiresAt,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return checkout URL' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
