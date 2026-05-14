import { NextResponse } from 'next/server';
import { sendMessage, sendPhoto } from '@/lib/telegram/bot';
import { updateSlot, getSlotsByPlan, approvePlan, getPlan } from '@/lib/db/queries/plans';
import { generatePost } from '@/lib/content/generate-post';
import { calculateScheduledAt } from '@/lib/content/schedule-calc';
import { previewKeyboard } from '@/lib/telegram/keyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TELEGRAM_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { planId, chatId } = (await req.json()) as {
    planId: string;
    chatId: number;
  };

  const plan = await getPlan(planId);
  if (!plan) {
    return NextResponse.json({ ok: false, error: 'Plan not found' }, { status: 404 });
  }

  const allSlots = await getSlotsByPlan(planId);
  const pending = allSlots.filter((s) => s.status === 'pending' && s.topic);

  if (pending.length === 0) {
    await sendMessage({ chatId, text: '⚠️ İşlenecek pending slot yok.' });
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  let ok = 0;
  let fail = 0;

  // Process all slots sequentially — Vercel Pro supports full 300s
  for (let i = 0; i < pending.length; i++) {
    const slot = pending[i]!;
    const slotLabel = `${dayLabels[slot.day_of_week] ?? '??'} ${slot.time_slot} [${slot.pillar}]`;
    try {
      const scheduledAt = calculateScheduledAt(
        plan.calendar_week,
        plan.year,
        slot.day_of_week,
        slot.time_slot,
      );

      const post = await generatePost({
        topic: slot.topic!,
        telegramChatId: String(chatId),
        channel: slot.channel === 'reel' || slot.channel === 'story' ? 'ig_story' : 'post',
        pillar: slot.pillar,
        scheduledAt,
      });

      await updateSlot(slot.id, { post_id: post.id, status: 'approved' });

      const isStory = slot.channel === 'story' || slot.channel === 'reel';
      await sendPhoto({
        chatId,
        photo: post.final_image_url,
        caption: [
          slotLabel,
          post.text_de,
          '',
          (post.hashtags ?? []).map((h: string) => `#${h.replace(/^#/, '')}`).join(' '),
        ].join('\n').slice(0, 1024),
        replyMarkup: previewKeyboard(post.id, isStory ? 'story' : 'post'),
      });

      ok++;

      // Rate-limit between sends
      if (i < pending.length - 1) {
        await sleep(TELEGRAM_DELAY_MS);
      }
    } catch (err) {
      await updateSlot(slot.id, { status: 'rejected' });
      const errorMsg = err instanceof Error ? err.message : String(err);
      await sendMessage({
        chatId,
        text: [
          `⚠️ Slot üretilemedi: ${slotLabel}`,
          `Konu: "${slot.topic}"`,
          `Hata: ${errorMsg.slice(0, 300)}`,
        ].join('\n'),
      });
      fail++;
    }
  }

  // All slots processed — approve plan
  await approvePlan(planId);

  const failNote = fail > 0 ? `\n⚠️ ${fail} slot başarısız (yukarıdaki hata mesajlarına bak).` : '';

  await sendMessage({
    chatId,
    text: `✅ KW${plan.calendar_week} planı onaylandı — ${ok}/${pending.length} slot üretildi.${failNote}\nPlanlanan saatte otomatik yayınlanacak.`,
  });

  return NextResponse.json({
    ok: true,
    planId,
    processed: ok,
    failed: fail,
    total: pending.length,
  });
}
