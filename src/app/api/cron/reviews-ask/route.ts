/**
 * GET /api/cron/reviews-ask
 *
 * Daily cron — finds sales 14+ days old that haven't been asked for a review
 * yet, sends a warm "how did it land?" email via Zoho SMTP, marks
 * review_ask_sent_at so we never double-send.
 *
 * Why 14 days? Buyer has had time to print, sit with it, and form an opinion.
 * Earlier feels pushy; later feels stale. Industry data: 14d post-purchase
 * is the optimal review-ask window for digital products.
 *
 * Auth: same CRON_SECRET pattern as other crons (header or ?secret=).
 *
 * Vercel cron schedule (vercel.json): `0 10 * * *` (10:00 UTC daily).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productSales, products } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/mail/smtp';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get('x-cron-secret') === expected) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Find sales that:
  //   • sold_at is at least 14 days ago
  //   • sold_at is at most 45 days ago (don't pester ancient buyers)
  //   • review_ask_sent_at IS NULL
  //   • buyer_email is set
  const due = await db
    .select({
      saleId: productSales.id,
      productId: productSales.product_id,
      buyerEmail: productSales.buyer_email,
      soldAt: productSales.sold_at,
      productTitle: products.shop_title,
      productSlug: products.slug,
    })
    .from(productSales)
    .leftJoin(products, eq(productSales.product_id, products.id))
    .where(
      sql`${productSales.review_ask_sent_at} IS NULL
          AND ${productSales.buyer_email} IS NOT NULL
          AND ${productSales.sold_at} <= NOW() - INTERVAL '14 days'
          AND ${productSales.sold_at} >= NOW() - INTERVAL '45 days'`,
    )
    .limit(50); // safety cap — never blast more than 50 per run

  const sent: string[] = [];
  const failed: { saleId: string; error: string }[] = [];

  for (const row of due) {
    if (!row.buyerEmail) continue;
    try {
      const subject = `A small ask about your ${row.productTitle ?? 'Fly & Froth printable'}`;
      const body = renderReviewEmail({
        title: row.productTitle ?? 'your printable',
        slug: row.productSlug ?? '',
      });
      const html = renderReviewEmailHtml({
        title: row.productTitle ?? 'your printable',
        slug: row.productSlug ?? '',
      });
      await sendMail({
        to: row.buyerEmail,
        subject,
        body,
        html,
      });

      // Mark sent
      await db
        .update(productSales)
        .set({ review_ask_sent_at: new Date() })
        .where(eq(productSales.id, row.saleId));

      sent.push(row.buyerEmail);
    } catch (err) {
      failed.push({
        saleId: row.saleId,
        error: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: due.length,
    sent: sent.length,
    failed: failed.length,
    errors: failed.slice(0, 5),
  });
}

// ─────────────────────────────────────────────────────────────
// Email templates — warm, personal, low-pressure
// ─────────────────────────────────────────────────────────────

function renderReviewEmail(args: { title: string; slug: string }): string {
  return `Hey,

Two weeks ago you picked up "${args.title}" from our studio. Hope it's earning its keep on your desk.

I'm Mehmet — the human behind Fly & Froth. We're a small editorial studio in Karben, Germany, and we read every reply.

A small ask: if it landed for you, would you consider a quick review on Etsy? It's the single biggest thing that helps other people find what we make.

If it didn't land — please reply and tell me. I want to know.

Either way, thanks for being here.

Mehmet
Fly & Froth · Karben, DE
fly-froth.com${args.slug ? ` · ${args.slug}` : ''}

P.S. If you have an idea for a printable we should make next, hit reply.
`;
}

function renderReviewEmailHtml(args: { title: string; slug: string }): string {
  const safeTitle = args.title.replace(/[<>]/g, '');
  return `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f1c19;line-height:1.55;max-width:580px;margin:32px auto;padding:0 24px;">
  <p>Hey,</p>
  <p>Two weeks ago you picked up <strong>"${safeTitle}"</strong> from our studio. Hope it's earning its keep on your desk.</p>
  <p>I'm Mehmet — the human behind Fly &amp; Froth. We're a small editorial studio in Karben, Germany, and we read every reply.</p>
  <p>A small ask: if it landed for you, would you consider a quick review on Etsy? It's the single biggest thing that helps other people find what we make.</p>
  <p>If it didn't land — please reply and tell me. I want to know.</p>
  <p>Either way, thanks for being here.</p>
  <p style="margin-top:24px;">Mehmet<br><span style="color:#666;font-size:13px;">Fly &amp; Froth · Karben, DE</span></p>
  <hr style="border:none;border-top:1px solid #e8e3dc;margin:24px 0;">
  <p style="color:#666;font-size:13px;">P.S. If you have an idea for a printable we should make next, hit reply.</p>
</body></html>`;
}
