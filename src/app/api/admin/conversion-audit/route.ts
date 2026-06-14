/**
 * GET /api/admin/conversion-audit?secret=<CRON_SECRET>
 *
 * Sprint M Faz 1 — Conversion infrastructure health check.
 *
 * Mevcut conversion systems:
 *   - Pinterest publishing  (Sprint H, scaffold + token kontrolü)
 *   - Email cart-abandon    (cron mevcut)
 *   - Customer reviews ask  (cron mevcut)
 *   - A/B title rotation    (cron mevcut)
 *   - Apparel pipeline      (Sprint K + L)
 *
 * Audit:
 *   1. Env vars var mı (Pinterest token, Resend, Stripe)
 *   2. DB son 30 gün — kaç cart_abandon, kaç sales, kaç review request
 *   3. Apparel candidates by status
 *   4. Eksiklik listesi + öncelik
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  cartAbandons,
  productSales,
  apparelCandidates,
  products,
} from '@/lib/db/schema';
import { gte, sql, count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface CheckResult {
  ok: boolean;
  detail?: string;
  count?: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ─── Env var check ─────────────────────────────────────────────
  const envCheck: Record<string, CheckResult> = {
    PINTEREST_ACCESS_TOKEN: {
      ok: Boolean(process.env.PINTEREST_ACCESS_TOKEN),
      detail: process.env.PINTEREST_ACCESS_TOKEN
        ? `set (len ${process.env.PINTEREST_ACCESS_TOKEN.length})`
        : 'EKSIK — Pinterest publishing kapalı, trafik kaynağı yok',
    },
    PINTEREST_BUSINESS_ID: {
      ok: Boolean(process.env.PINTEREST_BUSINESS_ID),
      detail: process.env.PINTEREST_BUSINESS_ID ? 'set' : 'EKSIK',
    },
    RESEND_API_KEY: {
      ok: Boolean(process.env.RESEND_API_KEY),
      detail: process.env.RESEND_API_KEY ? 'set' : 'EKSIK — email gönderimi kapalı',
    },
    STRIPE_SECRET_KEY: {
      ok: Boolean(process.env.STRIPE_SECRET_KEY),
      detail: process.env.STRIPE_SECRET_KEY ? 'set' : 'EKSIK — Stripe shop ödemesi kapalı',
    },
    ETSY_OAUTH_ACCESS_TOKEN: {
      ok: Boolean(process.env.ETSY_OAUTH_ACCESS_TOKEN),
      detail: process.env.ETSY_OAUTH_ACCESS_TOKEN ? 'set' : 'EKSIK — Etsy listing creation kapalı',
    },
    PRINTIFY_API_TOKEN: {
      ok: Boolean(process.env.PRINTIFY_API_TOKEN),
      detail: process.env.PRINTIFY_API_TOKEN ? 'set' : 'EKSIK — Apparel pipeline kapalı',
    },
    GA4_API_SECRET: {
      ok: Boolean(process.env.GA4_API_SECRET),
      detail: process.env.GA4_API_SECRET ? 'set' : 'EKSIK — server-side analytics off',
    },
    META_CAPI_ACCESS_TOKEN: {
      ok: Boolean(process.env.META_CAPI_ACCESS_TOKEN),
      detail: process.env.META_CAPI_ACCESS_TOKEN ? 'set' : 'EKSIK — Meta CAPI off',
    },
  };

  // ─── DB metrics — son 30 gün ───────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const dbMetrics: Record<string, unknown> = {};

  try {
    // Cart abandons
    const cartAbandonRows = await db
      .select({ c: count() })
      .from(cartAbandons)
      .where(gte(cartAbandons.created_at, thirtyDaysAgo));
    dbMetrics.cartAbandons30d = Number(cartAbandonRows[0]?.c ?? 0);
  } catch (err) {
    dbMetrics.cartAbandons30d_error = err instanceof Error ? err.message.slice(0, 150) : String(err);
  }

  try {
    // Cart abandons with follow-up (email sent)
    const cartFollowedUpRows = await db
      .select({ c: count() })
      .from(cartAbandons)
      .where(sql`${cartAbandons.created_at} >= ${thirtyDaysAgo} AND ${cartAbandons.followup_sent_at} IS NOT NULL`);
    dbMetrics.cartAbandonsFollowedUp30d = Number(cartFollowedUpRows[0]?.c ?? 0);
  } catch (err) {
    dbMetrics.cartFollowupErr = err instanceof Error ? err.message.slice(0, 150) : String(err);
  }

  try {
    // Product sales
    const salesRows = await db
      .select({ c: count() })
      .from(productSales)
      .where(gte(productSales.sold_at, thirtyDaysAgo));
    dbMetrics.productSales30d = Number(salesRows[0]?.c ?? 0);
  } catch (err) {
    dbMetrics.sales_error = err instanceof Error ? err.message.slice(0, 150) : String(err);
  }

  try {
    // Reviews ask sent
    const reviewsAskedRows = await db
      .select({ c: count() })
      .from(productSales)
      .where(sql`${productSales.sold_at} >= ${thirtyDaysAgo} AND ${productSales.review_ask_sent_at} IS NOT NULL`);
    dbMetrics.reviewsAsked30d = Number(reviewsAskedRows[0]?.c ?? 0);
  } catch (err) {
    dbMetrics.reviewsAskedErr = err instanceof Error ? err.message.slice(0, 150) : String(err);
  }

  try {
    // Total active products
    const productCount = await db.select({ c: count() }).from(products);
    dbMetrics.totalProducts = Number(productCount[0]?.c ?? 0);
  } catch (err) {
    dbMetrics.productCountErr = err instanceof Error ? err.message.slice(0, 150) : String(err);
  }

  // ─── Apparel candidates (Sprint K + L) ─────────────────────────
  const apparelByStatus: Record<string, number> = {};
  try {
    const rows = await db
      .select({ status: apparelCandidates.status, c: count() })
      .from(apparelCandidates)
      .groupBy(apparelCandidates.status);
    for (const r of rows) {
      apparelByStatus[r.status] = Number(r.c);
    }
  } catch (err) {
    apparelByStatus._error = -1 as unknown as number;
    apparelByStatus._errorMsg = (err instanceof Error ? err.message.slice(0, 100) : String(err)) as unknown as number;
  }

  // ─── Conversion gap analysis ───────────────────────────────────
  const gaps: Array<{ priority: 'high' | 'medium' | 'low'; system: string; issue: string; fix: string }> = [];

  if (!envCheck.PINTEREST_ACCESS_TOKEN.ok) {
    gaps.push({
      priority: 'high',
      system: 'Pinterest',
      issue: 'OAuth token yok, hiçbir pin yayını olamıyor',
      fix: 'Pinterest Developers app yarat → OAuth flow tamamla → PINTEREST_ACCESS_TOKEN Vercel env',
    });
  }
  if (!envCheck.RESEND_API_KEY.ok) {
    gaps.push({
      priority: 'high',
      system: 'Email',
      issue: 'Resend API key yok — cart-abandon, reviews-ask cron silent fail',
      fix: 'Resend.com hesabı + API key → Vercel env',
    });
  }
  const cartCount = Number(dbMetrics.cartAbandons30d ?? 0);
  const cartFollowedUp = Number(dbMetrics.cartAbandonsFollowedUp30d ?? 0);
  if (cartCount > 0 && cartFollowedUp === 0) {
    gaps.push({
      priority: 'high',
      system: 'Email cart-abandon',
      issue: `Son 30 gün ${cartCount} cart abandon var ama 0 follow-up gönderildi`,
      fix: 'cart-abandon-followup cron çalışmıyor, içerik veya env eksik',
    });
  }
  const sales30 = Number(dbMetrics.productSales30d ?? 0);
  const reviewsAsked = Number(dbMetrics.reviewsAsked30d ?? 0);
  if (sales30 > 0 && reviewsAsked === 0) {
    gaps.push({
      priority: 'medium',
      system: 'Reviews ask',
      issue: `Son 30 gün ${sales30} satış, 0 review request`,
      fix: 'reviews-ask cron çalışmıyor — env eksik ya da satıştan 7 gün geçmemiş',
    });
  }

  return NextResponse.json({
    ok: true,
    auditedAt: new Date().toISOString(),
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    envCheck,
    dbMetrics,
    apparelByStatus,
    conversionGaps: gaps,
    summary: {
      criticalGaps: gaps.filter((g) => g.priority === 'high').length,
      mediumGaps: gaps.filter((g) => g.priority === 'medium').length,
    },
    next_steps: [
      gaps.length === 0
        ? 'Tüm conversion sistemleri sağlıklı, satış ve analytics izlenebilir'
        : `Önce ${gaps.filter((g) => g.priority === 'high').length} kritik gap (high priority) çöz, sonra medium gap'lere geç`,
      'M2: Pinterest token kurulumu',
      'M3: Email cart-abandon optimize',
      'M4: Reviews ask aktivasyon',
      'M5: A/B title test sonuç tracker',
    ],
  });
}
