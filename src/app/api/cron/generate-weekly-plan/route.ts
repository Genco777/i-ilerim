import { NextResponse } from 'next/server';
import { generateNextWeekPlan, formatPlanForTelegram } from '@/lib/content/generate-plan';
import { sendMessage } from '@/lib/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const ids = adminUserIds();
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: 'No admin users configured' }, { status: 500 });
  }

  const primaryChatId = ids[0]!;

  try {
    const { plan, slots } = await generateNextWeekPlan(primaryChatId);
    const formatted = formatPlanForTelegram(plan, slots);

    await Promise.all(
      ids.map((chatId) =>
        sendMessage({ chatId, text: formatted, parseMode: 'Markdown' }).catch((err) =>
          console.error('[generate-weekly-plan] Telegram notify failed:', err),
        ),
      ),
    );

    return NextResponse.json({
      ok: true,
      planId: plan.id,
      week: plan.calendar_week,
      year: plan.year,
      slots: slots.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-weekly-plan] Failed:', msg);

    await Promise.all(
      ids.map((chatId) =>
        sendMessage({
          chatId,
          text: `⚠️ Haftalık plan oluşturulamadı: ${msg.slice(0, 500)}`,
        }).catch(() => {}),
      ),
    );

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
