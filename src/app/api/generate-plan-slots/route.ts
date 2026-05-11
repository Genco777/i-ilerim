import { NextResponse } from 'next/server';
import { sendMessage, sendPhoto } from '@/lib/telegram/bot';
import { getSlot, updateSlot, getSlotsByPlan, approvePlan, getPlan } from '@/lib/db/queries/plans';
import { generatePost } from '@/lib/content/generate-post';
import { calculateScheduledAt } from '@/lib/content/schedule-calc';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BATCH_SIZE = 4;
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

  const { planId, chatId, batchSize, batchOffset } = (await req.json()) as {
    planId: string;
    chatId: number;
    batchSize?: number;
    batchOffset?: number;
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

  // Batch slice
  const offset = batchOffset ?? 0;
  const limit = batchSize ?? pending.length;
  const batch = pending.slice(offset, offset + limit);

  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < batch.length; i++) {
    const slot = batch[i]!;
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

      await sendPhoto({
        chatId,
        photo: post.final_image_url,
        caption: [
          slotLabel,
          post.text_de,
          '',
          (post.hashtags ?? []).map((h: string) => `#${h.replace(/^#/, '')}`).join(' '),
        ].join('\n').slice(0, 1024),
      });

      ok++;

      // Rate-limit Telegram sends
      if (i < batch.length - 1) {
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

  const remaining = pending.length - (offset + batch.length);
  const totalOk = ok; // This batch only

  // Approve plan only when all batches are done
  if (remaining <= 0) {
    await approvePlan(planId);
  }

  const progressMsg = remaining > 0
    ? `\n📊 ${offset + batch.length}/${pending.length} işlendi. Kalan: ${remaining} slot.`
    : `\n✅ KW${plan.calendar_week} planı onaylandı. ${ok}/${pending.length} post üretildi.`;

  const failNote = fail > 0 ? `\n⚠️ ${fail} slot başarısız (yukarıdaki hata mesajlarına bak).` : '';

  await sendMessage({
    chatId,
    text: [
      `📤 Batch tamamlandı: ${ok}/${batch.length} slot${failNote}${progressMsg}`,
      remaining > 0 ? '' : 'Planlanan saatte otomatik yayınlanacak.',
    ].filter(Boolean).join('\n'),
  });

  return NextResponse.json({
    ok: true,
    planId,
    processed: ok,
    failed: fail,
    remaining,
    nextOffset: remaining > 0 ? offset + batch.length : undefined,
    nextBatchSize: remaining > 0 ? Math.min(BATCH_SIZE, remaining) : undefined,
  });
}
