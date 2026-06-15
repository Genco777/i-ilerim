/**
 * apparel-commands.ts — Sprint K Faz 6 Parça B
 *
 * Telegram'da apparel approval komutları:
 *   /candidates              — pending listesi göster
 *   /approve_<shortId>       — Etsy'ye gönder (Printify publish)
 *   /reject_<shortId>        — Printify'dan sil
 *
 * Short ID = candidate.id'nin uuid'inin tire'siz ilk 8 karakteri.
 *   Örn: a1b2c3d4-... → "a1b2c3d4"
 */

import { db } from '@/lib/db';
import { apparelCandidates } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { sendMessage } from './bot';
import {
  getEtsyShop,
  publishProduct,
  deleteProduct,
} from '@/lib/publish/printify';
import { generateProductVideo } from '@/lib/publish/video-generator';

function fmtShortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

/** /apparel_stats — tüm apparel candidate'ların özet rakamları. */
export async function handleApparelStatsCommand(chatId: number): Promise<void> {
  const byStatus = await db
    .select({ status: apparelCandidates.status, c: sql<number>`count(*)::int` })
    .from(apparelCandidates)
    .groupBy(apparelCandidates.status);

  const byNiche = await db
    .select({ niche: apparelCandidates.niche, c: sql<number>`count(*)::int` })
    .from(apparelCandidates)
    .groupBy(apparelCandidates.niche)
    .orderBy(sql`count(*) desc`)
    .limit(8);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const last7days = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(apparelCandidates)
    .where(sql`${apparelCandidates.created_at} >= ${sevenDaysAgo}`);

  const totalNow = byStatus.reduce((sum, r) => sum + Number(r.c), 0);
  const statusEmoji: Record<string, string> = {
    pending: '🟡',
    approved: '🟢',
    rejected: '🗑️',
    published: '✅',
    failed: '🔴',
  };

  const lines: string[] = [
    `*🧥 Apparel Stats*`,
    '',
    `*Toplam:* ${totalNow} candidate`,
    `*Son 7 gün:* ${Number(last7days[0]?.c ?? 0)} üretildi`,
    '',
    `*Status:*`,
    ...byStatus.map((r) => `${statusEmoji[r.status] ?? '•'} ${r.status}: ${Number(r.c)}`),
    '',
    `*Niche dağılımı:*`,
    ...byNiche.map((r) => `• ${r.niche}: ${Number(r.c)}`),
  ];

  await sendMessage({ chatId, text: lines.join('\n'), parseMode: 'Markdown' });
}

/** /candidates — pending listesi. */
export async function handleApparelListCommand(chatId: number): Promise<void> {
  const rows = await db
    .select({
      id: apparelCandidates.id,
      slogan: apparelCandidates.slogan,
      style: apparelCandidates.style,
      demand_hint: apparelCandidates.demand_hint,
      niche: apparelCandidates.niche,
      created_at: apparelCandidates.created_at,
      printify_product_id: apparelCandidates.printify_product_id,
    })
    .from(apparelCandidates)
    .where(eq(apparelCandidates.status, 'pending'))
    .orderBy(sql`${apparelCandidates.created_at} DESC`)
    .limit(15);

  if (rows.length === 0) {
    await sendMessage({
      chatId,
      text: '✨ Pending apparel candidate yok. Sabah 08:00 UTC cron yeni 5 candidate üretecek.',
    });
    return;
  }

  await sendMessage({
    chatId,
    text: `🧥 *${rows.length} Pending Apparel Candidate* — her satırda butonlar:`,
    parseMode: 'Markdown',
  });

  for (const r of rows) {
    const sid = fmtShortId(r.id);
    const dt = r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 10) : '?';
    const dh = r.demand_hint ? ` [${r.demand_hint}]` : '';
    try {
      await sendMessage({
        chatId,
        text: `*${r.slogan}*\n🆔 ${sid} • ${dt} • ${r.niche} • _${r.style}_${dh}`,
        parseMode: 'Markdown',
        replyMarkup: {
          inline_keyboard: [[
            { text: '✅ Onayla', callback_data: `apparel:approve:${sid}` },
            { text: '🗑️ Sil', callback_data: `apparel:reject:${sid}` },
          ]],
        },
      });
    } catch (err) {
      console.warn(`[apparel-list] sendMessage fail ${sid}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

/** /approve_<shortId> — Printify publish + DB status update. */
export async function handleApparelApproveCommand(chatId: number, shortId: string): Promise<void> {
  if (!shortId || shortId.length < 4) {
    await sendMessage({ chatId, text: '❌ Kullanım: /approve_<shortId> (en az 4 karakter)' });
    return;
  }

  // Find candidate (short ID = ilk 8 karakter — prefix match)
  const rows = await db
    .select()
    .from(apparelCandidates)
    .where(sql`replace(${apparelCandidates.id}::text, '-', '') LIKE ${shortId + '%'}`)
    .limit(2);

  if (rows.length === 0) {
    await sendMessage({ chatId, text: `❌ Candidate bulunamadı: \`${shortId}\`\n/candidates ile listeyi gör.`, parseMode: 'Markdown' });
    return;
  }
  if (rows.length > 1) {
    await sendMessage({ chatId, text: `⚠️ ${shortId} birden fazla candidate eşledi — daha uzun short ID yaz.` });
    return;
  }
  const candidate = rows[0];

  if (candidate.status !== 'pending') {
    await sendMessage({
      chatId,
      text: `⚠️ Bu candidate zaten *${candidate.status}* durumunda. Tekrar işlem yapamam.`,
      parseMode: 'Markdown',
    });
    return;
  }

  // Sprint M4 — Tek tıklama tam otomatik akış:
  // 1. publishProduct → Printify Etsy'ye push (DRAFT or ACTIVE — Etsy mağaza ayarına bağlı)
  // 2. Kling video gen (DB'ye video_url)
  // 3. Printify webhook → Etsy listing_id geldi
  // 4. Webhook handler: flat lay (cover) + color grid + size chart + video upload
  // 5. Webhook handler: Etsy listing state='draft' force (ACTIVE ise DRAFT'a çek)
  // Mehmet sadece Etsy DRAFT'ı onaylar.

  await sendMessage({ chatId, text: `⏳ "${candidate.slogan}" tam otomatik Etsy DRAFT pipeline başlıyor...` });

  try {
    const shop = await getEtsyShop();
    await publishProduct(shop.id, candidate.printify_product_id);

    await db
      .update(apparelCandidates)
      .set({
        status: 'approved',
        decided_at: new Date(),
        decided_by: `tg:${chatId}`,
        updated_at: new Date(),
      })
      .where(eq(apparelCandidates.id, candidate.id));

    await sendMessage({
      chatId,
      text: [
        `✅ *${candidate.slogan}* Etsy'ye gönderildi`,
        '',
        `Printify Etsy sync 1-5dk içinde tamamlanır. Sonra Sistem otomatik:`,
        `• 🎨 Flat lay cover photo`,
        `• 🌈 Color grid`,
        `• 📏 Size chart`,
        `• 🎬 Kling video`,
        `→ Etsy listing'e otomatik yüklenir + DRAFT'a alınır`,
        '',
        `Webhook gelince Telegram'a "🟢 Etsy'de DRAFT hazır" bildirimi atarım.`,
        `Sen Etsy DRAFT'ı açıp sadece "Yayınla" tıklarsın.`,
      ].join('\n'),
      parseMode: 'Markdown',
    });

    // Sprint M3 Faz 5 — Video gen (sadece approved, flat lay varsa)
    // Maliyet: $0.13 per video, 5 sn lifelike motion
    if (candidate.flat_lay_url) {
      try {
        await sendMessage({
          chatId,
          text: `🎬 Product video üretiliyor (~30-60 sn)...`,
        });
        const video = await generateProductVideo({
          imageUrl: candidate.flat_lay_url,
          durationSec: 5,
          aspectRatio: '4:5',
        });

        // DB'ye video_url kaydet
        await db
          .update(apparelCandidates)
          .set({ video_url: video.url, updated_at: new Date() })
          .where(eq(apparelCandidates.id, candidate.id));

        await sendMessage({
          chatId,
          text: [
            `🎬 *Product video hazır!*`,
            ``,
            `Etsy listing edit → "Add a video"`,
            `${video.url}`,
            ``,
            `Süre: ${video.durationSec}sn | Maliyet: $${video.costUsd.toFixed(2)}`,
          ].join('\n'),
          parseMode: 'Markdown',
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message.slice(0, 200) : String(err);
        console.warn(`[apparel-approve] video gen fail ${candidate.id}:`, errMsg);
        await sendMessage({
          chatId,
          text: `⚠️ Video üretilemedi (Etsy listing yine de hazır): ${errMsg.slice(0, 100)}`,
        });
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message.slice(0, 300) : String(err);
    const is404 = /Printify API 404/.test(errMsg) || /"error":"Not found"/.test(errMsg);
    const newStatus = is404 ? 'rejected' : 'failed';
    await db
      .update(apparelCandidates)
      .set({
        status: newStatus,
        error_log: errMsg,
        decided_at: new Date(),
        decided_by: `tg:${chatId}`,
        updated_at: new Date(),
      })
      .where(eq(apparelCandidates.id, candidate.id));

    if (is404) {
      await sendMessage({
        chatId,
        text: `🗑️ *${candidate.slogan}* — Printify'da bulunamadı (eski/silinmiş), DB'den otomatik rejected.`,
        parseMode: 'Markdown',
      });
    } else {
      await sendMessage({
        chatId,
        text: `❌ Etsy publish fail:\n\`\`\`\n${errMsg}\n\`\`\``,
        parseMode: 'Markdown',
      });
    }
  }
}

/** /reject_<shortId> — Printify product sil + DB status update. */
export async function handleApparelRejectCommand(chatId: number, shortId: string): Promise<void> {
  if (!shortId || shortId.length < 4) {
    await sendMessage({ chatId, text: '❌ Kullanım: /reject_<shortId> (en az 4 karakter)' });
    return;
  }

  const rows = await db
    .select()
    .from(apparelCandidates)
    .where(sql`replace(${apparelCandidates.id}::text, '-', '') LIKE ${shortId + '%'}`)
    .limit(2);

  if (rows.length === 0) {
    await sendMessage({ chatId, text: `❌ Candidate bulunamadı: \`${shortId}\``, parseMode: 'Markdown' });
    return;
  }
  if (rows.length > 1) {
    await sendMessage({ chatId, text: `⚠️ ${shortId} birden fazla candidate eşledi — daha uzun short ID yaz.` });
    return;
  }
  const candidate = rows[0];

  if (candidate.status === 'rejected') {
    await sendMessage({ chatId, text: `ℹ️ Zaten rejected: *${candidate.slogan}*`, parseMode: 'Markdown' });
    return;
  }
  if (candidate.status === 'approved' || candidate.status === 'published') {
    await sendMessage({
      chatId,
      text: `⚠️ Bu zaten *${candidate.status}* — Printify'dan silmek isterseniz Etsy listing'i de silmeniz gerek. /reject_<shortId> sadece pending için.`,
      parseMode: 'Markdown',
    });
    return;
  }

  await sendMessage({ chatId, text: `⏳ "${candidate.slogan}" Printify'dan siliniyor...` });

  try {
    const shop = await getEtsyShop();
    await deleteProduct(shop.id, candidate.printify_product_id);

    await db
      .update(apparelCandidates)
      .set({
        status: 'rejected',
        decided_at: new Date(),
        decided_by: `tg:${chatId}`,
        updated_at: new Date(),
      })
      .where(eq(apparelCandidates.id, candidate.id));

    await sendMessage({
      chatId,
      text: `🗑️ *${candidate.slogan}* Printify'dan silindi`,
      parseMode: 'Markdown',
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message.slice(0, 300) : String(err);
    await sendMessage({
      chatId,
      text: `❌ Printify silme fail:\n\`\`\`\n${errMsg}\n\`\`\``,
      parseMode: 'Markdown',
    });
  }
}
