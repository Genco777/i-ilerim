/**
 * Poster-only daily cron — runs in parallel to /api/cron/trend-discovery.
 *
 * Same pipeline as the main trend-discovery route, but pinned to the
 * `poster` productHint via `productHintFilter`. Discovery samples only
 * wall-art seed niches (see seed-topics.ts), and Banana Pro mockups +
 * PDF + Etsy publish all flow through the poster-aware branches.
 *
 * Schedule: 09:00 daily (3 hours after the planner cron — Vercel's
 * serverless concurrency limit is per-region per-function, so staggering
 * keeps both runs healthy on the free tier).
 */
import { NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/agent/notifications';
import { runDailyTrendPipeline, formatDigestMessage } from '@/lib/trend/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Same budget as the planner cron: hi-res hero + Banana Pro mockups +
// Higgsfield video + Etsy push. 800 s headroom is intentional.
export const maxDuration = 800;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

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
  if (!checkAuth(req)) return unauthorized();

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';

  // Honour the same TREND_ENGINE_ENABLED kill-switch as the planner cron.
  const enabled = (process.env.TREND_ENGINE_ENABLED ?? 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' });
  }

  // Telegram kill switch
  const { isSystemPaused } = await import('@/lib/system/kill-switch');
  if (await isSystemPaused()) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'system-paused' });
  }

  // Separate kill switch so we can disable just the poster cron without
  // touching the planner one (handy while iterating on the poster pipeline).
  const posterEnabled = (process.env.POSTER_CRON_ENABLED ?? 'true').toLowerCase();
  if (posterEnabled === 'false' || posterEnabled === '0') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'poster-disabled' });
  }

  try {
    const summary = await runDailyTrendPipeline({
      dryRun,
      productHintFilter: 'poster',
    });
    const digest = formatDigestMessage(summary);

    if (summary.productsCreated > 0 || summary.errors.length > 0) {
      // Prefix the digest so it's obvious which cron fired it.
      await notifyAdmins(`POSTER\n${digest}`);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      mode: 'poster',
      nichesConsidered: summary.nichesConsidered,
      productsCreated: summary.productsCreated,
      errors: summary.errors.length,
      digest,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[trend-discovery-poster] fatal:', err);
    await notifyAdmins(
      `🛑 Poster Trend Engine FATAL hata:\n${errMsg.slice(0, 800)}`,
    ).catch(() => {});
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
