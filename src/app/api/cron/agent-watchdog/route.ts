import { NextResponse } from 'next/server';
import { scanAll, formatWatchdogReport } from '@/lib/agent/watchdog';
import { sendMessage } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

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

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const items = await scanAll();
    const report = formatWatchdogReport(items);

    // If there are high urgency items or >2 items total, notify admin
    const hasHighUrgency = items.some((i) => i.urgency === 'high');
    const shouldNotify = hasHighUrgency || items.length >= 2;

    if (shouldNotify && report) {
      const ids = adminUserIds();
      await Promise.all(
        ids.map((chatId) =>
          sendMessage({ chatId, text: report }).catch((err) =>
            console.error(`[watchdog] sendMessage to ${chatId} failed:`, err),
          ),
        ),
      );
      return NextResponse.json({
        ok: true,
        notified: true,
        items: items.length,
        report,
      });
    }

    return NextResponse.json({
      ok: true,
      notified: false,
      items: items.length,
      reason: items.length === 0 ? 'no issues' : 'below notification threshold',
    });
  } catch (err) {
    console.error('[watchdog] scan error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
