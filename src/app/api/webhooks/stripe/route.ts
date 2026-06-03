/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler — verifies signature, then on
 * `checkout.session.completed`:
 *   1. Insert row into product_sales
 *   2. Issue download token (24h / 5 use)
 *   3. Send buyer email with download link via Zoho SMTP
 *   4. Notify Telegram admins of the new sale
 *   5. Update niche_performance for Faz 5 feedback loop
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe/client';
import { db } from '@/lib/db';
import { products, productSales, nichePerformance } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { issueDownloadToken } from '@/lib/shop/download-token';
import { notifyAdmins } from '@/lib/agent/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Stripe requires the raw body bytes to verify the signature; Next.js gives
// us a Request whose body() is fine to await as text.

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
  } catch (err) {
    return NextResponse.json(
      { error: 'Signature verification failed: ' + (err instanceof Error ? err.message : '') },
      { status: 400 },
    );
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === 'charge.refunded') {
      await handleRefund(event.data.object as Stripe.Charge);
    } else {
      // We don't care about other event types
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] processing failed', err);
    // Stripe will retry on 5xx; that's what we want for transient DB errors
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const trendProductId = session.metadata?.trend_product_id;
  if (!trendProductId) {
    console.warn('[stripe webhook] checkout.session.completed has no trend_product_id metadata');
    return;
  }

  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.id, trendProductId))
    .limit(1);
  const product = productRows[0];
  if (!product) {
    console.warn('[stripe webhook] product not found for', trendProductId);
    return;
  }

  // ── 1) Insert sale (idempotent via unique external_order_id) ──
  let saleId: string | null = null;
  try {
    const inserted = await db
      .insert(productSales)
      .values({
        product_id: product.id,
        channel: 'stripe_shop',
        external_order_id: session.id,
        amount_cents: session.amount_total ?? product.price_cents,
        currency: (session.currency ?? 'eur').toLowerCase(),
        buyer_email: session.customer_details?.email ?? null,
        buyer_country: session.customer_details?.address?.country ?? null,
        sold_at: new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000),
        raw_payload: session as unknown as Record<string, unknown>,
      })
      .returning({ id: productSales.id });
    saleId = inserted[0]?.id ?? null;
  } catch (err) {
    // Duplicate webhook delivery — sale already recorded, fetch existing.
    console.warn('[stripe webhook] sale insert race or duplicate', err);
    return;
  }

  if (!saleId) return;

  // ── 2) Issue download token ──
  const { url: downloadUrl, expiresAt } = await issueDownloadToken({
    productId: product.id,
    saleId,
    buyerEmail: session.customer_details?.email ?? null,
  });

  // ── 3) Send buyer email (best-effort) ──
  if (session.customer_details?.email) {
    try {
      await sendDeliveryEmail({
        toEmail: session.customer_details.email,
        toName: session.customer_details.name ?? undefined,
        productTitle: product.shop_title ?? 'Your purchase',
        downloadUrl,
        expiresAt,
      });
    } catch (err) {
      console.error('[stripe webhook] delivery email failed', err);
    }
  }

  // ── 4) Telegram admin notification ──
  const eur = (session.amount_total ?? 0) / 100;
  const buyerLine = session.customer_details?.email
    ? `${session.customer_details.email}${
        session.customer_details.address?.country
          ? ` (${session.customer_details.address.country})`
          : ''
      }`
    : 'anonim';
  const lines = [
    '💰 *Yeni satış!*',
    '',
    `📦 ${product.shop_title}`,
    `💶 €${eur.toFixed(2)}`,
    `👤 ${buyerLine}`,
    `🔗 ${downloadUrl}`,
    '',
    `Stripe session: ${session.id.slice(-12)}`,
  ];
  await notifyAdmins(lines.join('\n')).catch(() => {});

  // ── 5) niche_performance update (Faz 5 feedback) ──
  if (product.niche_id) {
    const nicheRows = await db
      .select({ topic: sql<string>`topic` })
      .from(sql`niches`)
      .where(sql`id = ${product.niche_id}`)
      .limit(1);
    const topic = nicheRows[0]?.topic;
    if (topic) {
      await db
        .insert(nichePerformance)
        .values({
          niche_topic: topic,
          product_count: 1,
          total_sales: 1,
          total_revenue_cents: session.amount_total ?? 0,
          last_sale_at: new Date(),
        })
        .onConflictDoUpdate({
          target: nichePerformance.niche_topic,
          set: {
            total_sales: sql`${nichePerformance.total_sales} + 1`,
            total_revenue_cents: sql`${nichePerformance.total_revenue_cents} + ${session.amount_total ?? 0}`,
            last_sale_at: new Date(),
            computed_at: new Date(),
          },
        });
    }
  }
}

async function handleRefund(charge: Stripe.Charge): Promise<void> {
  // Find the sale by checkout session via payment_intent → metadata
  // For MVP we just notify admins; full refund handling is Faz 5+.
  await notifyAdmins(
    `↩️ İade alındı: charge ${charge.id.slice(-12)} — €${(charge.amount_refunded / 100).toFixed(2)}`,
  ).catch(() => {});
}

// ── Email delivery via existing Zoho SMTP infra ──

async function sendDeliveryEmail(opts: {
  toEmail: string;
  toName?: string;
  productTitle: string;
  downloadUrl: string;
  expiresAt: Date;
}): Promise<void> {
  // Use the existing mail/smtp helper
  const { sendMail } = await import('@/lib/mail/smtp');

  const expiry = opts.expiresAt.toLocaleString('en-GB', {
    timeZone: 'Europe/Berlin',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const subject = `Your download: ${opts.productTitle}`;
  const greeting = opts.toName ? `Hi ${opts.toName.split(' ')[0]},` : 'Hi,';

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1916; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 22px; margin-bottom: 8px;">Thanks for your purchase</h1>
  <p>${greeting}</p>
  <p>Your download for <strong>${escapeHtml(opts.productTitle)}</strong> is ready.</p>
  <p style="margin: 28px 0;">
    <a href="${opts.downloadUrl}" style="background: #1c1916; color: #fbfaf6; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: bold;">Download your PDF</a>
  </p>
  <p style="font-size: 13px; color: #6b6b6b;">
    This link works for 24 hours and can be used up to 5 times. After that, reply to this email and we'll send a fresh link.<br>
    Link expires: ${expiry} (Europe/Berlin)
  </p>
  <hr style="border: 0; border-top: 1px solid #e0d8cc; margin: 32px 0;">
  <p style="font-size: 11px; color: #6b6b6b; line-height: 1.5;">
    Fly &amp; Froth · Karben, Germany · www.fly-froth.com<br>
    Gemäß §19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.<br>
    Widerrufsrecht erlischt bei sofortiger Bereitstellung digitaler Inhalte mit ausdrücklicher Zustimmung des Kunden.
  </p>
</body></html>`;

  // Plain-text fallback for clients that don't render HTML
  const text = [
    greeting,
    '',
    `Your download for "${opts.productTitle}" is ready.`,
    '',
    `Download link (24 h, 5 uses): ${opts.downloadUrl}`,
    `Expires: ${expiry} (Europe/Berlin)`,
    '',
    'If you have any issues, just reply to this email.',
    '',
    '— Fly & Froth, Karben, Germany',
    'Gemäß §19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.',
  ].join('\n');

  await sendMail({
    to: opts.toEmail,
    subject,
    body: text,
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
