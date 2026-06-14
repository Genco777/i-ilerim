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
import { eq } from 'drizzle-orm';
import { generateApparelDesignAI } from '@/lib/publish/apparel-design-ai';
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
  const count = Math.min(Number(url.searchParams.get('count') ?? '5'), 10);
  const dryRun = url.searchParams.get('dryRun') === '1';

  const niche = (nicheOverride ?? nicheForToday()) as RotatedNiche;
  const cronRunId = cronRunIdForToday();

  // Idempotency: aynı gün zaten çalıştıysa skip (dryRun haricinde)
  if (!dryRun) {
    const existing = await db
      .select({ id: apparelCandidates.id })
      .from(apparelCandidates)
      .where(eq(apparelCandidates.cron_run_id, cronRunId))
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
  }> = [];
  let failures = 0;

  // ─── Step 1: Research ─────────────────────────────────────────
  let sloganIdeas: Array<{
    slogan: string;
    theme: string;
    style: string;
    demandHint: 'high' | 'medium' | 'low';
    inspiredBy?: string;
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
      count: Math.max(count + 5, 10), // ekstra üret, en iyilerini seçeriz
    });

    // High demand önce, sonra medium, en fazla count tane al
    sloganIdeas = [...ideas.ideas]
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 } as const;
        return (order[a.demandHint] ?? 3) - (order[b.demandHint] ?? 3);
      })
      .slice(0, count);

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
  for (const idea of sloganIdeas) {
    const t1 = Date.now();
    try {
      // a) Banana 2 + Sharp manuel RGBA → transparent PNG
      const design = await generateApparelDesignAI({
        slogan: idea.slogan,
        theme: idea.theme,
        style: idea.style as 'modern-flat' | 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic',
        aspectRatio: '4:5',
        resolution: '2K',
      });

      if (dryRun) {
        steps.push({
          step: 'design',
          ok: true,
          data: {
            slogan: idea.slogan,
            buffer_kb: Math.round(design.buffer.length / 1024),
            costUsd: design.costEstimateUsd,
            dryRun: true,
          },
        });
        continue;
      }

      // b) Printify image upload
      const uploaded = await uploadImageByBase64(
        design.buffer.toString('base64'),
        `apparel-${cronRunId}-${idea.slogan.slice(0, 30).replace(/[^a-z0-9]/gi, '-')}.png`,
      );

      // c) Product create (DRAFT — publishToEtsy=false, sadece Printify'da kalır)
      const description = [
        idea.slogan,
        '',
        'Soft, comfortable, designed in our studio in Karben, Germany.',
        'Premium fabric, durable print. Ships from US.',
        '',
        '— Fly & Froth Studio',
      ].join('\n');

      const product = await createApparelProduct({
        shopId,
        type: 'tshirt',
        title: idea.slogan.slice(0, 130),
        description,
        imageId: uploaded.id,
        priceCents: 2499,
        tags: ['fly and froth', niche, idea.style, 'apparel', 'gift', 'unisex'].slice(0, 13),
      });

      // d) DB insert
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
          printify_preview_url: uploaded.preview_url,
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
        printify_preview_url: uploaded.preview_url,
        demand_hint: idea.demandHint,
        inspired_by: idea.inspiredBy ?? null,
      });

      steps.push({
        step: `design+create:${idea.slogan.slice(0, 30)}`,
        ok: true,
        data: {
          id,
          printifyProductId: product.id,
          variants: product.variants?.length ?? 0,
          ms: Date.now() - t1,
        },
      });
    } catch (err) {
      failures++;
      steps.push({
        step: `design+create:${idea.slogan.slice(0, 30)}`,
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
