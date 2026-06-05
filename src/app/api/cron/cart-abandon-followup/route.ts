/**
 * Cart Abandon Follow-up Cron — C2
 *
 * Runs hourly. Picks rows where the next email stage is due, sends, marks.
 *
 * Stage logic:
 *   - Stage 1 due if abandoned > 1h ago AND email_1 not sent
 *   - Stage 2 due if email_1 sent > 23h ago AND email_2 not sent
 *   - Stage 3 due if email_2 sent > 48h ago AND email_3 not sent
 * Skip all rows where recovered_at IS NOT NULL.
 */
import { NextResponse } from 'next/server';
import {
  findDueCartAbandons,
  sendStage1Email,
  sendStage2Email,
  sendStage3Email,
} from '@/lib/marketing/cart-abandon';

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

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  const enabled = (process.env.CART_ABANDON_ENABLED ?? 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const due = await findDueCartAbandons();

  const result = {
    stage1Sent: 0,
    stage2Sent: 0,
    stage3Sent: 0,
    errors: [] as string[],
  };

  for (const row of due.stage1) {
    try {
      await sendStage1Email(row);
      result.stage1Sent++;
    } catch (e) {
      result.errors.push(`s1 ${row.id}: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
    }
  }
  for (const row of due.stage2) {
    try {
      await sendStage2Email(row);
      result.stage2Sent++;
    } catch (e) {
      result.errors.push(`s2 ${row.id}: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
    }
  }
  for (const row of due.stage3) {
    try {
      await sendStage3Email(row);
      result.stage3Sent++;
    } catch (e) {
      result.errors.push(`s3 ${row.id}: ${e instanceof Error ? e.message.slice(0, 100) : String(e)}`);
    }
  }

  return NextResponse.json({ ok: true, ...result });
}
