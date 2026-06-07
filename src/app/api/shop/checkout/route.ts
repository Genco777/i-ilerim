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

/**
 * Sprint I — Tier naming refactor.
 *
 * DB slot mapping (kolon adları değişmedi, sadece logical isim güncellendi):
 *   - price_cents          / stripe_price_id    → 'basic'    (€2.99 PDF)
 *   - tier_b_price_cents   / stripe_price_b_id  → 'pro'      (Sprint G personalized, eski adı: 'plus')
 *   - tier_c_price_cents   / stripe_price_c_id  → 'editable' (Sprint I Canva editable, eski adı: 'pro')
 *
 * Back-compat alias'lar — eski client'lar (önbellek/eski mobil deeplink) bir
 * süre daha çalışsın:
 *   - 'plus' (eski)  → 'pro' (yeni)
 *   - 'pro'  (eski Sprint G dönemi) ↔ ambiguous (eski 'pro' = personalized,
 *      yeni 'pro' = aynı şey aslında! Sadece 'editable' yeni). Yani 'pro'
 *      değişmeden gider.
 */
type TierKey = 'basic' | 'pro' | 'editable';

interface CheckoutInput {
  slug: string | null;
  tier: TierKey;
  customName: string | null;
  customDate: string | null;
}

function normalizeTier(raw: unknown): TierKey {
  if (raw === 'editable') return 'editable';
  if (raw === 'pro') return 'pro';
  if (raw === 'plus') return 'pro'; // back-compat alias
  return 'basic';
}

async function extractInput(req: Request): Promise<CheckoutInput> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  let slug: string | null = null;
  let tier: TierKey = 'basic';
  let customName: string | null = null;
  let customDate: string | null = null;

  if (contentType.includes('application/json')) {
    try {
      const body = (await req.json()) as {
        slug?: unknown;
        tier?: unknown;
        custom_name?: unknown;
        custom_date?: unknown;
      };
      if (typeof body.slug === 'string' && body.slug.length > 0) slug = body.slug;
      tier = normalizeTier(body.tier);
      if (typeof body.custom_name === 'string' && body.custom_name.trim()) customName = body.custom_name.trim().slice(0, 40);
      if (typeof body.custom_date === 'string' && body.custom_date.trim()) customDate = body.custom_date.trim().slice(0, 30);
      return { slug, tier, customName, customDate };
    } catch {
      return { slug, tier, customName, customDate };
    }
  }
  try {
    const fd = await req.formData();
    const s = fd.get('slug');
    const n = fd.get('custom_name');
    const d = fd.get('custom_date');
    if (typeof s === 'string' && s.length > 0) slug = s;
    tier = normalizeTier(fd.get('tier'));
    if (typeof n === 'string' && n.trim()) customName = n.trim().slice(0, 40);
    if (typeof d === 'string' && d.trim()) customDate = d.trim().slice(0, 30);
    return { slug, tier, customName, customDate };
  } catch {
    return { slug, tier, customName, customDate };
  }
}

export async function POST(req: Request) {
  const { slug, tier, customName, customDate } = await extractInput(req);

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
  // Sprint I — 'pro' → tier_b slot (personalized), 'editable' → tier_c slot (Canva).
  let selectedPrice = priceId;
  if (tier === 'pro' && fresh.stripe_price_b_id) selectedPrice = fresh.stripe_price_b_id;
  else if (tier === 'editable' && fresh.stripe_price_c_id) selectedPrice = fresh.stripe_price_c_id;

  // Editable tier guard: master Canva design olmadan editable satış engellenir
  // (alıcı tıklayınca boş link açılır — kötü deneyim). Bunun yerine Basic'e düş.
  if (tier === 'editable' && !fresh.editable_canva_share_url) {
    console.warn(`[checkout] editable tier requested but no canva share URL for ${product.id} — falling back to basic`);
    tier = 'basic';
    selectedPrice = priceId;
  }

  const base = getShopBaseUrl().replace(/\/+$/, '');
  const stripe = getStripe();
  // C2 — Set session expiration to 30 min so abandoned sessions emit the
  // checkout.session.expired webhook (otherwise default is 24h and we lose
  // the recovery window). 30 min minimum per Stripe.
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60;

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
      // Sprint G — Pro tier personalization data, picked up by webhook
      ...(tier === 'pro' && customName ? { custom_name: customName } : {}),
      ...(tier === 'pro' && customDate ? { custom_date: customDate } : {}),
      // Sprint I — Editable tier metadata
      ...(tier === 'editable' && fresh.editable_canva_share_url
        ? { editable_canva_share_url: fresh.editable_canva_share_url.slice(0, 500) }
        : {}),
      ...(tier === 'editable' && fresh.editable_instructions_pdf_url
        ? { editable_instructions_pdf_url: fresh.editable_instructions_pdf_url.slice(0, 500) }
        : {}),
    },
    automatic_tax: { enabled: false },
    expires_at: expiresAt,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return checkout URL' }, { status: 500 });
  }

  return NextResponse.redirect(session.url, { status: 303 });
}
