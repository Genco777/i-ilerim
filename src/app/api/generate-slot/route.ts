import { NextResponse } from 'next/server';
import { sendMessage, sendPhoto } from '@/lib/telegram/bot';
import { getSlot, updateSlot, getSlotsByPlan, approvePlan, getPlan } from '@/lib/db/queries/plans';
import { generatePost } from '@/lib/content/generate-post';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { slotId, chatId, planId } = (await req.json()) as {
    slotId: string;
    chatId: number;
    planId: string;
  };

  const slot = await getSlot(slotId);
  if (!slot) {
    return NextResponse.json({ ok: false, error: 'Slot not found' }, { status: 404 });
  }

  if (slot.status === 'approved' || slot.status === 'rejected') {
    return NextResponse.json({ ok: true, skipped: true, reason: `already ${slot.status}` });
  }

  if (!slot.topic) {
    await updateSlot(slotId, { status: 'rejected' });
    return NextResponse.json({ ok: true, skipped: true, reason: 'no topic' });
  }

  const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const slotLabel = `${dayLabels[slot.day_of_week] ?? '??'} ${slot.time_slot} [${slot.pillar}]`;

  try {
    const post = await generatePost({
      topic: slot.topic,
      telegramChatId: String(chatId),
      channel: slot.channel === 'reel' ? 'ig_story' : 'post',
      pillar: slot.pillar,
    });

    await updateSlot(slotId, { post_id: post.id, status: 'approved' });

    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: [
        slotLabel,
        post.text_de,
        '',
        (post.hashtags ?? []).map((h: string) => `#${h}`).join(' '),
      ].join('\n').slice(0, 1024),
    });

    await maybeSendPlanSummary(chatId, planId);

    return NextResponse.json({ ok: true, slotId, postId: post.id });
  } catch (err) {
    await updateSlot(slotId, { status: 'rejected' });
    const errorMsg = err instanceof Error ? err.message : String(err);

    await sendMessage({
      chatId,
      text: [
        `⚠️ Slot üretilemedi: ${slotLabel}`,
        `Konu: "${slot.topic}"`,
        `Hata: ${errorMsg.slice(0, 300)}`,
      ].join('\n'),
    });

    await maybeSendPlanSummary(chatId, planId);

    return NextResponse.json({ ok: false, slotId, error: errorMsg }, { status: 500 });
  }
}

async function maybeSendPlanSummary(chatId: number, planId: string): Promise<void> {
  const [plan, allSlots] = await Promise.all([
    getPlan(planId),
    getSlotsByPlan(planId),
  ]);
  if (!plan) return;
  if (plan.status === 'approved') return;

  const stillPending = allSlots.filter(
    (s) => s.status !== 'approved' && s.status !== 'rejected',
  );
  if (stillPending.length > 0) return;

  await approvePlan(planId);
  const ok = allSlots.filter((s) => s.status === 'approved').length;
  const fail = allSlots.filter((s) => s.status === 'rejected').length;
  const failNote = fail > 0 ? `\n⚠️ ${fail} slot başarısız (yukarıdaki hata mesajlarına bak).` : '';

  await sendMessage({
    chatId,
    text: [
      `✅ KW${plan.calendar_week} planı onaylandı.`,
      `${ok}/${allSlots.length} post üretildi, görselleri yukarıda gönderildi.${failNote}`,
      'Planlanan saatte otomatik yayınlanacak.',
    ].join('\n'),
  });
}
