import { NextResponse } from 'next/server';
import { sendMessage, sendPhoto } from '@/lib/telegram/bot';
import { updateSlot, getSlotsByPlan, approvePlan, getPlan } from '@/lib/db/queries/plans';
import { generatePost } from '@/lib/content/generate-post';
import { calculateScheduledAt } from '@/lib/content/schedule-calc';
import { previewKeyboard } from '@/lib/telegram/keyboard';

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

  const { planId, chatId, limit } = (await req.json()) as {
    planId: string;
    chatId: number;
    limit?: number;
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

  // Take first N pending slots (batches controlled by caller)
  const batchSize = limit ?? pending.length;
  const batch = pending.slice(0, batchSize);

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

  // Recalculate remaining from current DB state (not stale `pending` array)
  // because some slots may have been processed by a previous timed-out batch.
  const freshSlots = await getSlotsByPlan(planId);
  const stillPending = freshSlots.filter(
    (s) => s.status === 'pending' && s.topic,
  );
  const remaining = stillPending.length;

  if (remaining <= 0) {
    await approvePlan(planId);
  }

  const progressMsg = remaining > 0
    ? `\n📊 ${ok}/${batch.length} işlendi. Kalan: ${remaining} slot.`
    : `\n✅ KW${plan.calendar_week} planı onaylandı. Tüm slotlar üretildi.`;

  const failNote = fail > 0 ? `\n⚠️ ${fail} slot başarısız (yukarıdaki hata mesajlarına bak).` : '';

  await sendMessage({
    chatId,
    text: [
      `📤 Batch tamamlandı: ${ok}/${batch.length} slot${failNote}${progressMsg}`,
      remaining > 0 ? '' : 'Planlanan saatte otomatik yayınlanacak.',
    ].filter(Boolean).join('\n'),
  });

  // Self-iterate: if there are more pending slots, trigger the next batch
  // via a separate function invocation. This keeps the chain alive even if
  // the original caller (webhook) times out.
  if (remaining > 0) {
    const appUrl = process.env.APP_URL ?? 'https://admin.fly-froth.com';
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      // Fire-and-forget: do NOT await, let this function return its response
      // while the next batch starts in a fresh invocation.
      fetch(`${appUrl}/api/generate-plan-slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({ planId, chatId, limit: BATCH_SIZE }),
      }).catch((err) =>
        console.error('[generate-plan-slots] Self-chain fetch failed:', err),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    planId,
    processed: ok,
    failed: fail,
    remaining,
  });
}
