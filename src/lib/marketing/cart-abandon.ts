/**
 * C2 — Cart Abandon Email Sequence
 *
 * Triggered by Stripe webhook `checkout.session.expired`. Enrolls the buyer
 * in a 3-stage email drip:
 *   - Stage 1 (T+1h): "Did something go wrong?" (gentle nudge)
 *   - Stage 2 (T+24h): "15% off — code SAVE15" (incentive)
 *   - Stage 3 (T+72h): "Last call — going public" (FOMO close)
 *
 * Cron `/api/cron/cart-abandon-followup` runs hourly, picks rows where
 * the appropriate stage's email is due, sends via Zoho SMTP, stamps the
 * email_N_sent_at column.
 *
 * Recovery: if buyer comes back and completes checkout, `markCartAbandonRecovered`
 * is called from the `checkout.session.completed` handler — stops the sequence.
 */

import type Stripe from 'stripe';
import { db } from '@/lib/db';
import { cartAbandons, products, productBundles } from '@/lib/db/schema';
import { and, eq, isNull, isNotNull, lt, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/mail/smtp';

const STAGE_INTERVALS_MS = {
  stage1: 60 * 60 * 1000,       // 1 hour
  stage2: 24 * 60 * 60 * 1000,  // 24 hours
  stage3: 72 * 60 * 60 * 1000,  // 72 hours
};

/**
 * Enroll a buyer in the cart abandon sequence. Idempotent — same Stripe
 * session ID never enrolls twice (UNIQUE constraint on stripe_session_id).
 */
export async function enrollCartAbandon(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const email =
    session.customer_email ?? session.customer_details?.email ?? null;
  if (!email) {
    console.warn('[c2] expired session has no email — cannot enroll', session.id);
    return;
  }

  const metadata = session.metadata ?? {};
  const productId = (metadata.trend_product_id as string) || null;
  const productSlug = (metadata.product_slug as string) || null;
  const bundleId = (metadata.bundle_id as string) || null;

  if (!productId && !bundleId) {
    console.warn('[c2] expired session has no product or bundle metadata — skipping', session.id);
    return;
  }

  await db
    .insert(cartAbandons)
    .values({
      customer_email: email,
      product_id: productId,
      product_slug: productSlug,
      bundle_id: bundleId,
      stripe_session_id: session.id,
    })
    .onConflictDoNothing({ target: cartAbandons.stripe_session_id });

  console.log(`[c2-cart-abandon] enrolled ${email} for session ${session.id}`);
}

/**
 * Mark a cart abandon as recovered (called from successful checkout webhook).
 * We match by customer email + product (loose match — same buyer eventually
 * bought something within 7 days counts as recovery for analytics).
 */
export async function markCartAbandonRecovered(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const email =
    session.customer_email ?? session.customer_details?.email ?? null;
  if (!email) return;

  const recoveryWindowDays = 7;
  const cutoff = new Date(Date.now() - recoveryWindowDays * 24 * 60 * 60 * 1000);

  await db
    .update(cartAbandons)
    .set({
      recovered_at: new Date(),
      recovered_session_id: session.id,
    })
    .where(
      and(
        eq(cartAbandons.customer_email, email),
        isNull(cartAbandons.recovered_at),
        // only consider abandons from the last 7 days
        sql`${cartAbandons.abandoned_at} > ${cutoff.toISOString()}`,
      ),
    );
}

interface DueRow {
  id: string;
  customer_email: string;
  product_id: string | null;
  product_slug: string | null;
  bundle_id: string | null;
  abandoned_at: Date;
  email_1_sent_at: Date | null;
  email_2_sent_at: Date | null;
  email_3_sent_at: Date | null;
}

/**
 * Find cart abandons due for the next email stage.
 * Stage 1: abandoned > 1h ago, email_1 not sent
 * Stage 2: email_1 sent > 23h ago, email_2 not sent
 * Stage 3: email_2 sent > 48h ago, email_3 not sent
 *
 * Caller invokes this and dispatches per row.
 */
export async function findDueCartAbandons(): Promise<{
  stage1: DueRow[];
  stage2: DueRow[];
  stage3: DueRow[];
}> {
  const now = new Date();
  const stage1Cutoff = new Date(now.getTime() - STAGE_INTERVALS_MS.stage1);
  const stage2Cutoff = new Date(now.getTime() - STAGE_INTERVALS_MS.stage2);
  const stage3Cutoff = new Date(now.getTime() - STAGE_INTERVALS_MS.stage3);

  const baseFilter = (extra: ReturnType<typeof and>) =>
    db
      .select()
      .from(cartAbandons)
      .where(and(isNull(cartAbandons.recovered_at), extra)) as unknown as Promise<DueRow[]>;

  const [stage1, stage2, stage3] = await Promise.all([
    baseFilter(
      and(
        isNull(cartAbandons.email_1_sent_at),
        lt(cartAbandons.abandoned_at, stage1Cutoff),
      )!,
    ),
    baseFilter(
      and(
        isNotNull(cartAbandons.email_1_sent_at),
        isNull(cartAbandons.email_2_sent_at),
        lt(cartAbandons.email_1_sent_at, stage2Cutoff),
      )!,
    ),
    baseFilter(
      and(
        isNotNull(cartAbandons.email_2_sent_at),
        isNull(cartAbandons.email_3_sent_at),
        lt(cartAbandons.email_2_sent_at, stage3Cutoff),
      )!,
    ),
  ]);

  return { stage1, stage2, stage3 };
}

async function getCheckoutInfo(row: DueRow): Promise<{ title: string; link: string } | null> {
  const shopBase = (process.env.SHOP_BASE_URL ?? 'https://shop.fly-froth.com').replace(/\/+$/, '');
  if (row.product_id) {
    const r = await db
      .select()
      .from(products)
      .where(eq(products.id, row.product_id))
      .limit(1);
    const p = r[0];
    if (!p) return null;
    return {
      title: p.shop_title ?? p.etsy_title ?? 'your printable',
      link: `${shopBase}/${p.slug ?? ''}`,
    };
  }
  if (row.bundle_id) {
    const r = await db
      .select()
      .from(productBundles)
      .where(eq(productBundles.id, row.bundle_id))
      .limit(1);
    const b = r[0];
    if (!b) return null;
    return {
      title: b.name,
      link: `${shopBase}/bundle/${b.slug}`,
    };
  }
  return null;
}

export async function sendStage1Email(row: DueRow): Promise<void> {
  const info = await getCheckoutInfo(row);
  if (!info) return;

  await sendMail({
    body: '', // text fallback, HTML is the real content
    to: row.customer_email,
    subject: `Did something go wrong with your ${info.title.slice(0, 40)}?`,
    html: `<div style="font-family:system-ui;padding:24px;max-width:520px;margin:auto">
      <p>Hi there,</p>
      <p>We noticed you started a checkout for <strong>${info.title}</strong> but didn't finish.</p>
      <p>If something went wrong — broken card, mind changed, app crashed — just hit reply and let us know.</p>
      <p><a href="${info.link}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin:12px 0">Pick up where you left off →</a></p>
      <p style="font-size:12px;color:#888;margin-top:32px">Fly & Froth Studio<br>info@fly-froth.com</p>
    </div>`,
  });

  await db
    .update(cartAbandons)
    .set({ email_1_sent_at: new Date() })
    .where(eq(cartAbandons.id, row.id));
}

export async function sendStage2Email(row: DueRow): Promise<void> {
  const info = await getCheckoutInfo(row);
  if (!info) return;

  await sendMail({
    body: '', // text fallback, HTML is the real content
    to: row.customer_email,
    subject: `15% off ${info.title.slice(0, 40)} — code SAVE15`,
    html: `<div style="font-family:system-ui;padding:24px;max-width:520px;margin:auto">
      <p>Hi again,</p>
      <p>Still thinking about <strong>${info.title}</strong>?</p>
      <p>Here's a one-time <strong>15% off</strong> code valid for the next 48 hours:</p>
      <p style="font-size:24px;background:#f5f0e6;padding:16px;text-align:center;letter-spacing:4px;border-radius:6px"><strong>SAVE15</strong></p>
      <p><a href="${info.link}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin:12px 0">Use my code →</a></p>
      <p style="font-size:12px;color:#888;margin-top:32px">Fly & Froth Studio<br>info@fly-froth.com</p>
    </div>`,
  });

  await db
    .update(cartAbandons)
    .set({ email_2_sent_at: new Date() })
    .where(eq(cartAbandons.id, row.id));
}

export async function sendStage3Email(row: DueRow): Promise<void> {
  const info = await getCheckoutInfo(row);
  if (!info) return;

  await sendMail({
    body: '', // text fallback, HTML is the real content
    to: row.customer_email,
    subject: `Last call — ${info.title.slice(0, 40)}`,
    html: `<div style="font-family:system-ui;padding:24px;max-width:520px;margin:auto">
      <p>Hi,</p>
      <p>This is the last note about <strong>${info.title}</strong>.</p>
      <p>Your 15% off (SAVE15) is still valid for a few more hours. After that we won't bother you again.</p>
      <p><a href="${info.link}" style="display:inline-block;background:#111;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;margin:12px 0">One last look →</a></p>
      <p style="font-size:12px;color:#888;margin-top:32px">Whatever you decide — thanks for considering us.<br>Fly & Froth Studio<br>info@fly-froth.com</p>
    </div>`,
  });

  await db
    .update(cartAbandons)
    .set({ email_3_sent_at: new Date() })
    .where(eq(cartAbandons.id, row.id));
}
