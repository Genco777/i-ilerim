/**
 * GET /api/cron/apparel-daily
 *   ?secret=<CRON_SECRET>
 *   &niche=<override>    (optional — default: niche-rotation gününe göre)
 *   &count=<N>           (optional — default 5, max 10)
 *   &dryRun=1            (optional — research+design üret ama Printify upload yapma)
 *
 * Sprint K Faz 6 Parça A — Daily apparel candidate üretimi.
 *
 * Akış (08:00 UTC her gün):
 *   1. Kill switch check (system_config)
 *   2. nicheForToday() — Pzt:books, Sal:coffee, Çrş:dog, ...
 *   3. apparel-research helper'ı doğrudan çağır (Google Trends + GPT-4o)
 *   4. Top N (default 5) "high demand" slogan candidate seç
 *   5. Her biri için:
 *      a. generateApparelDesignAI (Banana 2 + Sharp manual RGBA transparent)
 *      b. Printify uploadImageByBase64
 *      c. createApparelProduct (DRAFT — Etsy'ye gitmiyor)
 *      d. DB apparel_candidates insert (status='pending')
 *   6. Telegram'a notification — 5 mockup + slogan + Printify link
 *
 * Idempotency: cron_run_id = YYYY-MM-DD. Aynı tarih için zaten çalıştıysa skip.
 *
 * Maliyet: 5 × Banana $0.04 + research $0.0125 ≈ $0.21/gün → ~$6.50/ay.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apparelCandidates } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateApparelDesignAI, generateApparelDesignAIBothVariants } from '@/lib/publish/apparel-design-ai';
import { buildEtsyTitle, buildEtsyDescription, buildEtsyTags } from '@/lib/etsy/title-builder';
// Sprint M3 — Visual upgrade
import { generateStyledFlatLay, defaultShirtColorForNiche } from '@/lib/publish/flat-lay-generator';
import { createColorVariantGrid } from '@/lib/publish/color-grid';
import { generateSizeChart } from '@/lib/publish/size-chart';
import { uploadImage } from '@/lib/blob';
import {
  uploadImageByBase64,
  createApparelProduct,
  getEtsyShop,
} from '@/lib/publish/printify';
import { getNicheTrends } from '@/lib/research/google-trends';
import { generateSloganIdeas } from '@/lib/research/slogan-ideas';
import { lookupNiche, filterByRelevance } from '@/lib/research/niche-keywords';
import { nicheForToday, cronRunIdForToday, type RotatedNiche } from '@/lib/research/niche-rotation';
import { notifyApparelCandidates } from '@/lib/telegram/apparel-notify';
import { isSystemPaused } from '@/lib/system/kill-switch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 5 design × ~20s (Banana + Sharp + Printify) + research ~10s = ~120s. Budget 600s.
export const maxDuration = 600;

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

  // Kill switch
  if (await isSystemPaused()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'system-paused' });
  }

  const url = new URL(req.url);
  const nicheOverride = url.searchParams.get('niche');
  // Sprint L Faz 1: 5 tshirt + 2 tote = 7 candidate/gün
  const tshirtCount = Math.min(Number(url.searchParams.get('tshirtCount') ?? '5'), 10);
  const toteCount   = Math.min(Number(url.searchParams.get('toteCount') ?? '2'), 5);
  const count       = tshirtCount + toteCount;
  // Legacy ?count= override — sadece tshirt için, tote 0 olur
  const countOverride = url.searchParams.get('count');
  const effectiveTshirtCount = countOverride ? Math.min(Number(countOverride), 10) : tshirtCount;
  const effectiveToteCount   = countOverride ? 0 : toteCount;
  const dryRun = url.searchParams.get('dryRun') === '1';

  const niche = (nicheOverride ?? nicheForToday()) as RotatedNiche;
  const cronRunId = cronRunIdForToday();

  // Idempotency: aynı gün + aynı niche kombosu çalıştıysa skip (dryRun haricinde).
  // Sprint L: niche-aware — books bugün çalıştı ama coffee aynı gün hala mümkün.
  if (!dryRun) {
    const existing = await db
      .select({ id: apparelCandidates.id })
      .from(apparelCandidates)
      .where(and(
        eq(apparelCandidates.cron_run_id, cronRunId),
        eq(apparelCandidates.niche, niche),
      ))
      .limit(1);
    if (existing.length > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'already-ran-today',
        cronRunId,
      });
    }
  }

  const t0 = Date.now();
  const steps: Array<{ step: string; ok: boolean; data?: unknown; error?: string }> = [];
  const created: Array<{
    id: string;
    slogan: string;
    theme: string;
    style: string;
    printify_product_id: string;
    printify_preview_url: string;
    demand_hint: string | null;
    inspired_by: string | null;
    flat_lay_url?: string | null;
    size_chart_url?: string | null;
    color_grid_url?: string | null;
  }> = [];
  let failures = 0;

  // ─── Step 1: Research ─────────────────────────────────────────
  let sloganIdeas: Array<{
    slogan: string;
    theme: string;
    style: string;
    demandHint: 'high' | 'medium' | 'low';
    inspiredBy?: string;
    giftAngle?: string;
    recipientHint?: string;
  }> = [];

  try {
    const nicheDef = lookupNiche(niche);
    const gt = await getNicheTrends(niche, { geo: 'US', days: 90 });
    const rawQueries = [
      ...gt.rising.map((q) => q.query),
      ...gt.top.slice(0, 5).map((q) => q.query),
    ];
    const { kept: googleQueries } = nicheDef
      ? filterByRelevance(rawQueries, nicheDef)
      : { kept: rawQueries };

    const ideas = await generateSloganIdeas({
      niche,
      googleTrends: googleQueries,
      count: Math.max(effectiveTshirtCount + effectiveToteCount + 5, 10), // ekstra üret, en iyilerini seçeriz
    });

    // High demand önce, sonra medium, en fazla tshirtCount+toteCount tane al
    sloganIdeas = [...ideas.ideas]
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 } as const;
        return (order[a.demandHint] ?? 3) - (order[b.demandHint] ?? 3);
      })
      .slice(0, effectiveTshirtCount + effectiveToteCount);

    steps.push({
      step: 'research',
      ok: true,
      data: {
        niche,
        googleQueries: googleQueries.length,
        ideasGenerated: ideas.count,
        selectedTopN: sloganIdeas.length,
        costUsd: ideas.costUsdEstimate,
      },
    });
  } catch (err) {
    steps.push({
      step: 'research',
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return NextResponse.json({ ok: false, steps, cronRunId }, { status: 500 });
  }

  if (sloganIdeas.length === 0) {
    return NextResponse.json({ ok: false, reason: 'no-ideas', steps, cronRunId });
  }

  // ─── Step 2: Etsy shop ────────────────────────────────────────
  let shopId: number;
  try {
    const shop = await getEtsyShop();
    shopId = shop.id;
    steps.push({ step: 'get-shop', ok: true, data: { shopId, shopTitle: shop.title } });
  } catch (err) {
    steps.push({
      step: 'get-shop',
      ok: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return NextResponse.json({ ok: false, steps, cronRunId }, { status: 500 });
  }

  // ─── Step 3: Her slogan için design + upload + product create ─
  // Sprint L Faz 1: ilk N idea tshirt, sonraki M idea tote
  for (let idx = 0; idx < sloganIdeas.length; idx++) {
    const idea = sloganIdeas[idx];
    const productType: 'tshirt' | 'tote' = idx < effectiveTshirtCount ? 'tshirt' : 'tote';
    // Tote square print area → 1:1 aspect ratio uygun
    const aspectRatio: '1:1' | '4:5' = productType === 'tote' ? '1:1' : '4:5';

    const t1 = Date.now();
    try {
      // a) Banana 2 + Sharp manuel RGBA → transparent PNG
      // Sprint L Faz 2: tshirt için light+dark variant, tote için sadece light
      let lightBuffer: Buffer;
      let darkBuffer: Buffer | null = null;
      let designCostUsd = 0.04;

      if (productType === 'tshirt') {
        const both = await generateApparelDesignAIBothVariants({
          slogan: idea.slogan,
          theme: idea.theme,
          style: idea.style as 'modern-flat' | 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic',
          aspectRatio,
          resolution: '2K',
        });
        lightBuffer = both.lightBuffer;
        darkBuffer = both.darkBuffer;
        designCostUsd = both.costEstimateUsd;
      } else {
        const design = await generateApparelDesignAI({
          slogan: idea.slogan,
          theme: idea.theme,
          style: idea.style as 'modern-flat' | 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic',
          aspectRatio,
          resolution: '2K',
        });
        lightBuffer = design.buffer;
        designCostUsd = design.costEstimateUsd;
      }

      if (dryRun) {
        steps.push({
          step: 'design',
          ok: true,
          data: {
            slogan: idea.slogan,
            productType,
            light_kb: Math.round(lightBuffer.length / 1024),
            dark_kb: darkBuffer ? Math.round(darkBuffer.length / 1024) : null,
            costUsd: designCostUsd,
            dryRun: true,
          },
        });
        continue;
      }

      // b) Printify image upload — light (her zaman) + dark (sadece tshirt)
      const sloganSlug = idea.slogan.slice(0, 30).replace(/[^a-z0-9]/gi, '-');
      const lightUpload = await uploadImageByBase64(
        lightBuffer.toString('base64'),
        `apparel-${cronRunId}-${productType}-${sloganSlug}-light.png`,
      );
      let darkUpload: typeof lightUpload | null = null;
      if (darkBuffer) {
        darkUpload = await uploadImageByBase64(
          darkBuffer.toString('base64'),
          `apparel-${cronRunId}-${productType}-${sloganSlug}-dark.png`,
        );
      }

      // c) Sprint M2.5: Etsy SEO optimization — title/description/tags builder
      // Bestseller pattern: 130+ char title, gift framing, niche keywords, DE+EN mix
      const titleOpts = {
        slogan: idea.slogan,
        niche,
        productType,
        giftAngle: idea.giftAngle,
      } as const;
      const seoTitle = buildEtsyTitle(titleOpts);
      const seoDescription = buildEtsyDescription(titleOpts);
      const seoTags = buildEtsyTags(titleOpts);

      const product = await createApparelProduct({
        shopId,
        type: productType,
        title: seoTitle,
        description: seoDescription,
        imageId: lightUpload.id,
        darkImageId: darkUpload?.id,
        priceCents: productType === 'tote' ? 1899 : 2499,
        tags: seoTags,
      });

      const uploadedPreview = lightUpload.preview_url;

      // d) Sprint M3 — Visual upgrade (sadece tshirt için, tote skip)
      // Flat lay + Size chart + Color grid → Vercel Blob
      let flatLayUrl: string | null = null;
      let sizeChartUrl: string | null = null;
      let colorGridUrl: string | null = null;

      if (productType === 'tshirt') {
        // Flat lay (Banana cottagecore scene + design composite)
        try {
          const flat = await generateStyledFlatLay({
            niche,
            shirtColor: defaultShirtColorForNiche(niche),
            designBuffer: lightBuffer,
            aspectRatio: '4:5',
          });
          const sloganSafe = idea.slogan.slice(0, 30).replace(/[^a-z0-9]/gi, '-');
          const blob = await uploadImage(
            flat.buffer,
            `apparel/${cronRunId}/${sloganSafe}-flatlay.png`,
            'image/png',
          );
          flatLayUrl = blob.url;
        } catch (err) {
          console.warn(`[apparel-daily] flat-lay fail ${idea.slogan}:`, err instanceof Error ? err.message : String(err));
        }

        // Size chart
        try {
          const chart = await generateSizeChart('tshirt');
          const sloganSafe = idea.slogan.slice(0, 30).replace(/[^a-z0-9]/gi, '-');
          const blob = await uploadImage(
            chart.buffer,
            `apparel/${cronRunId}/${sloganSafe}-sizechart.png`,
            'image/png',
          );
          sizeChartUrl = blob.url;
        } catch (err) {
          console.warn(`[apparel-daily] size-chart fail ${idea.slogan}:`, err instanceof Error ? err.message : String(err));
        }

        // Color grid (Printify mockup URL'lerinden)
        try {
          const mockupSrcs = (product.images ?? [])
            .map((img: { src: string }) => img.src)
            .filter((src: string) => typeof src === 'string')
            .slice(0, 6);
          if (mockupSrcs.length >= 3) {
            const grid = await createColorVariantGrid({ mockupUrls: mockupSrcs });
            const sloganSafe = idea.slogan.slice(0, 30).replace(/[^a-z0-9]/gi, '-');
            const blob = await uploadImage(
              grid.buffer,
              `apparel/${cronRunId}/${sloganSafe}-colorgrid.png`,
              'image/png',
            );
            colorGridUrl = blob.url;
          }
        } catch (err) {
          console.warn(`[apparel-daily] color-grid fail ${idea.slogan}:`, err instanceof Error ? err.message : String(err));
        }
      }

      // e) DB insert
      const rows = await db
        .insert(apparelCandidates)
        .values({
          cron_run_id: cronRunId,
          niche,
          slogan: idea.slogan,
          theme: idea.theme,
          style: idea.style,
          demand_hint: idea.demandHint,
          inspired_by: idea.inspiredBy ?? null,
          printify_product_id: product.id,
          printify_preview_url: uploadedPreview,
          status: 'pending',
        })
        .returning({ id: apparelCandidates.id });

      const id = rows[0].id;
      created.push({
        id,
        slogan: idea.slogan,
        theme: idea.theme,
        style: idea.style,
        printify_product_id: product.id,
        printify_preview_url: uploadedPreview,
        demand_hint: idea.demandHint,
        inspired_by: idea.inspiredBy ?? null,
        // Sprint M3 — Extra visual assets (Vercel Blob URL'leri)
        flat_lay_url: flatLayUrl,
        size_chart_url: sizeChartUrl,
        color_grid_url: colorGridUrl,
      });

      steps.push({
        step: `design+create:${productType}:${idea.slogan.slice(0, 30)}`,
        ok: true,
        data: {
          id,
          productType,
          printifyProductId: product.id,
          variants: product.variants?.length ?? 0,
          ms: Date.now() - t1,
        },
      });
    } catch (err) {
      failures++;
      steps.push({
        step: `design+create:${productType}:${idea.slogan.slice(0, 30)}`,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
      // Bir candidate fail → diğerlerine devam
    }
  }

  // ─── Step 4: Telegram notification ────────────────────────────
  if (!dryRun && created.length > 0) {
    try {
      await notifyApparelCandidates({
        niche,
        cronRunId,
        candidates: created,
        failures,
      });
      steps.push({ step: 'telegram-notify', ok: true, data: { sent: created.length } });
    } catch (err) {
      steps.push({
        step: 'telegram-notify',
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    cronRunId,
    niche,
    totalMs: Date.now() - t0,
    summary: {
      researched: sloganIdeas.length,
      created: created.length,
      failures,
    },
    steps,
    candidates: created.map((c) => ({ id: c.id, slogan: c.slogan, productId: c.printify_product_id })),
  });
}
