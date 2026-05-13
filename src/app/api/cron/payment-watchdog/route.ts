import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
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
    const now = new Date();
    const items: string[] = [];

    // 1. Invoices sent 3 days ago — gentle reminder
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const day3Overdue = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'sent'),
          gte(invoices.created_at, fourDaysAgo),
          lte(invoices.created_at, threeDaysAgo),
        ),
      );

    if (day3Overdue.length > 0) {
      const total = day3Overdue.reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
      items.push(
        `🟡 3 günlük ${day3Overdue.length} fatura (${(total / 100).toFixed(2)}€): nazik hatırlatma gönderilmeli.`,
      );
    }

    // 2. Invoices sent 7 days ago — firmer reminder
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);

    const day7Overdue = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'sent'),
          gte(invoices.created_at, eightDaysAgo),
          lte(invoices.created_at, sevenDaysAgo),
        ),
      );

    if (day7Overdue.length > 0) {
      const total = day7Overdue.reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
      items.push(
        `🟠 7 günlük ${day7Overdue.length} fatura (${(total / 100).toFixed(2)}€): ikinci hatırlatma gönderilmeli.`,
      );
    }

    // 3. Invoices sent 30+ days ago — urgent
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const day30Overdue = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.status, 'sent'),
          sql`${invoices.created_at} < ${thirtyDaysAgo.toISOString()}`,
        ),
      );

    if (day30Overdue.length > 0) {
      const total = day30Overdue.reduce((sum, i) => sum + (i.total_cents ?? 0), 0);
      const names = day30Overdue
        .map((i) => {
          const recipient = i.recipient as Record<string, string> | null;
          return recipient?.name ?? 'Bilinmeyen';
        })
        .join(', ');
      items.push(
        `🔴 30+ gün ${day30Overdue.length} fatura (${(total / 100).toFixed(2)}€) — ACİL: ${names}`,
      );
    }

    // Build report
    if (items.length > 0) {
      const report = [
        '🧾 **Ödeme Takip Raporu**',
        '',
        ...items,
        '',
        'Aksiyon: `/fatura` ile fatura detaylarını gör, `/chat` ile müşteriye ulaş.',
      ].join('\n');

      const ids = adminUserIds();
      await Promise.all(
        ids.map((chatId) =>
          sendMessage({ chatId, text: report }).catch((err) =>
            console.error(`[payment-watchdog] sendMessage to ${chatId} failed:`, err),
          ),
        ),
      );

      return NextResponse.json({
        ok: true,
        notified: true,
        overdueBy3Days: day3Overdue.length,
        overdueBy7Days: day7Overdue.length,
        overdueBy30Days: day30Overdue.length,
        report,
      });
    }

    return NextResponse.json({
      ok: true,
      notified: false,
      reason: 'all invoices paid on time',
    });
  } catch (err) {
    console.error('[payment-watchdog] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Payment scan failed' },
      { status: 500 },
    );
  }
}
