/**
 * GET /api/admin/apparel-research?secret=<CRON_SECRET>
 *   &niche=books                          (default: books)
 *   &geo=US                               (default: US)
 *   &pinterestRegion=US                   (default: US)
 *   &count=20                             (kaç slogan idea — default 20, max 30)
 *   &skipPinterest=1                      (Pinterest atla — token sorunu olursa)
 *   &skipLlm=1                            (sadece trend data, slogan üretme)
 *
 * Sprint K Faz 5 — apparel ürün araştırma helper.
 *
 * Akış:
 *   1. Google Trends → niche için rising + top related queries (free)
 *   2. Pinterest Trends → growing keywords (free, Pinterest OAuth gerek)
 *   3. OpenAI gpt-4o → trend keyword'lerden 20 slogan candidate üret
 *
 * Sonuç: JSON — trend data + 20 hazır slogan (slogan/theme/style/demandHint).
 * Bu çıktıyı doğrudan /api/admin/printify-test-product?slogan=...&theme=...
 * URL'ine yapıştırabilirsin → AI illustration ürün çıkar.
 */

import { NextResponse } from 'next/server';
import { getNicheTrends } from '@/lib/research/google-trends';
import { getPinterestTrends } from '@/lib/research/pinterest-trends';
import { generateSloganIdeas } from '@/lib/research/slogan-ideas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

interface StepResult {
  step: string;
  ok: boolean;
  ms?: number;
  data?: unknown;
  error?: string;
}

function nowMs(): number {
  return Date.now();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const niche           = (url.searchParams.get('niche') ?? 'books').trim();
  const geo             = (url.searchParams.get('geo') ?? 'US').toUpperCase();
  const pinterestRegion = (url.searchParams.get('pinterestRegion') ?? 'US').toUpperCase();
  const count           = Math.min(Number(url.searchParams.get('count') ?? '20'), 30);
  const skipPinterest   = url.searchParams.get('skipPinterest') === '1';
  const skipLlm         = url.searchParams.get('skipLlm') === '1';

  const steps: StepResult[] = [];

  // ─── Step 1: Google Trends ──────────────────────────────────────
  let googleQueries: string[] = [];
  const t1 = nowMs();
  try {
    const gt = await getNicheTrends(niche, { geo, days: 90 });
    // Rising en değerli (yeni momentum), top da ekle ama az
    googleQueries = [
      ...gt.rising.map((q) => q.query),
      ...gt.top.slice(0, 5).map((q) => q.query),
    ];
    steps.push({
      step: 'google-trends',
      ok: true,
      ms: nowMs() - t1,
      data: {
        geo: gt.geo,
        risingCount: gt.rising.length,
        topCount: gt.top.length,
        risingPreview: gt.rising.slice(0, 10).map((q) => `${q.query} (+${q.formattedValue ?? q.value})`),
        topPreview: gt.top.slice(0, 10).map((q) => `${q.query} (${q.value})`),
      },
    });
  } catch (err) {
    steps.push({
      step: 'google-trends',
      ok: false,
      ms: nowMs() - t1,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    // Trends fail = devam et, Pinterest + LLM yine çalışabilir
  }

  // ─── Step 2: Pinterest Trends ───────────────────────────────────
  let pinterestQueries: string[] = [];
  if (!skipPinterest) {
    const t2 = nowMs();
    try {
      const pt = await getPinterestTrends({
        region: pinterestRegion,
        trendType: 'growing',
        containsKeyword: niche.length >= 4 ? niche : undefined, // çok kısa niche'de filtre etme
      });
      if (pt.warning) {
        steps.push({
          step: 'pinterest-trends',
          ok: false,
          ms: nowMs() - t2,
          error: pt.warning,
        });
      } else {
        pinterestQueries = pt.trends.map((t) => t.keyword);
        steps.push({
          step: 'pinterest-trends',
          ok: true,
          ms: nowMs() - t2,
          data: {
            region: pt.region,
            trendType: pt.trendType,
            keywordCount: pt.trends.length,
            preview: pt.trends.slice(0, 10).map((t) => t.keyword),
          },
        });
      }
    } catch (err) {
      steps.push({
        step: 'pinterest-trends',
        ok: false,
        ms: nowMs() - t2,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  } else {
    steps.push({ step: 'pinterest-trends', ok: true, data: { skipped: true } });
  }

  // ─── Step 3: OpenAI slogan generation ───────────────────────────
  if (skipLlm) {
    return NextResponse.json({
      ok: true,
      niche,
      mode: 'trends-only',
      steps,
      googleQueries: googleQueries.slice(0, 20),
      pinterestQueries: pinterestQueries.slice(0, 20),
    });
  }

  const t3 = nowMs();
  let ideasResult;
  try {
    ideasResult = await generateSloganIdeas({
      niche,
      googleTrends: googleQueries,
      pinterestTrends: pinterestQueries,
      count,
    });
    steps.push({
      step: 'slogan-llm',
      ok: true,
      ms: nowMs() - t3,
      data: {
        model: ideasResult.model,
        ideaCount: ideasResult.count,
        promptTokens: ideasResult.promptTokens,
        completionTokens: ideasResult.completionTokens,
        costUsd: ideasResult.costUsdEstimate,
      },
    });
  } catch (err) {
    steps.push({
      step: 'slogan-llm',
      ok: false,
      ms: nowMs() - t3,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return NextResponse.json({ ok: false, niche, steps }, { status: 500 });
  }

  // Sloganları "high demand" → "medium" → "low" sıralı
  const sortedIdeas = [...ideasResult.ideas].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    return (order[a.demandHint] ?? 3) - (order[b.demandHint] ?? 3);
  });

  // Her slogan için hazır product-create URL üret (Mehmet copy-paste eder)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shop.fly-froth.com';
  const secret2 = process.env.CRON_SECRET ?? '';
  const productCreateUrls = sortedIdeas.slice(0, 10).map((idea) => ({
    slogan: idea.slogan,
    theme: idea.theme,
    style: idea.style,
    demandHint: idea.demandHint,
    inspiredBy: idea.inspiredBy,
    testUrl: `${baseUrl}/api/admin/printify-test-product?secret=${secret2}&slogan=${encodeURIComponent(idea.slogan)}&theme=${encodeURIComponent(idea.theme)}&style=${idea.style}`,
  }));

  return NextResponse.json({
    ok: true,
    niche,
    summary: {
      googleQueriesUsed: googleQueries.length,
      pinterestQueriesUsed: pinterestQueries.length,
      sloganIdeasGenerated: ideasResult.count,
      totalCostUsd: ideasResult.costUsdEstimate,
    },
    steps,
    sloganIdeas: sortedIdeas,
    topPicksReadyToCreate: productCreateUrls,
    next_steps: [
      '1. topPicksReadyToCreate içindeki "testUrl"\'lerden 2-3 tanesini tarayıcıda aç → Banana 2 ile apparel üret',
      '2. Printify dashboard\'unda mockup\'ları gör (https://printify.com/app/products)',
      '3. Beğendiklerini ?publishToEtsy=1 ile Etsy draft\'a gönder',
      '4. Sonra Faz 6\'da cron entegrasyonu — bu helper günde 1× çalışıp Telegram\'a onay gönderir',
    ],
  });
}
