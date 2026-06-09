/**
 * GET /api/admin/cost-audit?secret=<CRON_SECRET>
 *
 * READ-ONLY: Son 30 gün üretim sayılarını DB'den çek + Replicate maliyet
 * tahmini. Sistem değiştirmiyor — sadece görüntüleme.
 *
 * Kullanım:
 *   /api/admin/cost-audit?secret=...           → son 30 gün
 *   /api/admin/cost-audit?secret=...&days=7    → son 7 gün
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { gte, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Replicate prices (USD per request, ~2026)
const PRICE = {
  nanoBanana2:  0.04,   // google/nano-banana-2
  nanoBananaPro: 0.10,  // google/nano-banana-pro
  fluxSchnell:  0.003,  // black-forest-labs/flux-schnell
  fluxDev:      0.025,  // black-forest-labs/flux-dev
  recraft:      0.05,   // recraft-ai/recraft-v3
  openai:       0.04,   // openai gpt-image-1 medium
  higgsfield:   0.15,   // hf-image-to-video
};

const EUR_PER_USD = 0.93; // approx

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? 30)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Son N gün'de oluşturulan ürünleri çek
  const rows = await db
    .select({
      id: products.id,
      created_at: products.created_at,
      type: products.type,
      hero_image_url: products.hero_image_url,
      mockup_image_urls: products.mockup_image_urls,
      video_url: products.video_url,
      digital_file_url: products.digital_file_url,
      editable_canva_design_id: products.editable_canva_design_id,
      editable_preview_image_url: products.editable_preview_image_url,
    })
    .from(products)
    .where(gte(products.created_at, cutoff));

  const totalProducts = rows.length;
  let totalHeroes = 0;
  let totalMockups = 0;
  let totalVideos = 0;
  let totalPDFs = 0;
  let totalCanvaPreviews = 0;
  const byType: Record<string, number> = {};

  for (const r of rows) {
    if (r.hero_image_url) totalHeroes++;
    const mockups = (r.mockup_image_urls as string[] | null) ?? [];
    totalMockups += mockups.length;
    if (r.video_url) totalVideos++;
    if (r.digital_file_url) totalPDFs++;
    if (r.editable_preview_image_url) totalCanvaPreviews++;
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }

  // Replicate maliyet TAHMİNİ:
  //   Her hero: 1 × Banana Pro (~$0.10)
  //   Her mockup: 1 × Banana 2 (~$0.04)
  //   Her video: 1 × Higgsfield (~$0.15)
  //   (Pass-2 retry'ları sayılmadı — gerçek 1.3-1.5× olabilir)
  const cost_hero_usd       = totalHeroes  * PRICE.nanoBananaPro;
  const cost_mockup_usd     = totalMockups * PRICE.nanoBanana2;
  const cost_video_usd      = totalVideos  * PRICE.higgsfield;
  const cost_total_usd      = cost_hero_usd + cost_mockup_usd + cost_video_usd;
  const cost_total_eur      = cost_total_usd * EUR_PER_USD;

  // Günlük ortalama
  const perDayProducts = totalProducts / days;
  const perDayCostEur  = cost_total_eur / days;
  const monthlyCostEur = perDayCostEur * 30;

  // Cron count (vercel.json'dan tahmin) — manuel referans
  // 9 trend cron / 2 = ~4-5 unique slot/day, alternating planner+poster.
  // Actual cron tetiklenmesini DB'den günlere göre gör:
  const byDay: Record<string, number> = {};
  for (const r of rows) {
    const day = r.created_at.toISOString().slice(0, 10);
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  return NextResponse.json({
    period: {
      days,
      cutoff_iso: cutoff.toISOString(),
      now_iso: new Date().toISOString(),
    },
    counts: {
      total_products: totalProducts,
      total_heroes: totalHeroes,
      total_mockups: totalMockups,
      total_videos: totalVideos,
      total_pdfs: totalPDFs,
      total_canva_previews: totalCanvaPreviews,
      by_type: byType,
      products_per_day: byDay,
    },
    cost_estimate_usd: {
      heroes: cost_hero_usd.toFixed(2),
      mockups: cost_mockup_usd.toFixed(2),
      videos: cost_video_usd.toFixed(2),
      total: cost_total_usd.toFixed(2),
    },
    cost_estimate_eur: {
      total_period: cost_total_eur.toFixed(2),
      per_day: perDayCostEur.toFixed(2),
      monthly_projection: monthlyCostEur.toFixed(2),
    },
    averages: {
      products_per_day: perDayProducts.toFixed(1),
      mockups_per_product: totalProducts > 0 ? (totalMockups / totalProducts).toFixed(2) : '0',
    },
    note: 'Estimate based on Replicate prices ~2026. Real cost = +20-50% (retries, pass-2 fallback, failed requests still billed). Compare with https://replicate.com/account/billing',
  });
}
