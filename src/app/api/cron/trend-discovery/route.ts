import { NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/agent/notifications';
import { runDailyTrendPipeline, formatDigestMessage } from '@/lib/trend/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Discovery + 2-3 content generations × Claude call ≈ 30-90 s typical.
export const maxDuration = 300;

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

  // Allow ?dry=1 to skip DB writes (useful for first-day testing).
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';

  // Toggle: TREND_ENGINE_ENABLED defaults to true so the cron is opt-out,
  // not opt-in (set to 'false' or '0' to disable).
  const enabled = (process.env.TREND_ENGINE_ENABLED ?? 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' });
  }

  try {
    const summary = await runDailyTrendPipeline({ dryRun });
    const digest = formatDigestMessage(summary);

    // Send digest unless nothing happened and no errors (silent days are fine).
    if (summary.productsCreated > 0 || summary.errors.length > 0) {
      await notifyAdmins(digest);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      nichesConsidered: summary.nichesConsidered,
      productsCreated: summary.productsCreated,
      errors: summary.errors.length,
      digest,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[trend-discovery] fatal:', err);
    // Tell admins about hard failures too — silent breakage is the worst case.
    await notifyAdmins(`🛑 Trend Engine FATAL hata:\n${errMsg.slice(0, 800)}`).catch(() => {});
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
