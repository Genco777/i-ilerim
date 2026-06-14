/**
 * apparel-notify.ts — Sprint K Faz 6
 *
 * Telegram'a günlük apparel candidate notification gönderir. notifyAdmins
 * pattern'ini takip eder (ADMIN_TELEGRAM_CHAT_IDS env'inden alıcılar).
 *
 * Parça A: manual onay — Mehmet Printify dashboard link'ini tıklar, Etsy
 * publish butonuna basar. Parça B'de /approve_<id> /reject_<id> komutları.
 */

import { sendMessage, sendPhoto } from './bot';

export interface ApparelCandidate {
  id: string;
  slogan: string;
  theme: string;
  style: string;
  demand_hint?: string | null;
  inspired_by?: string | null;
  printify_product_id: string;
  printify_preview_url?: string | null;
  // Sprint M3 — Extra visual assets
  flat_lay_url?: string | null;
  size_chart_url?: string | null;
  color_grid_url?: string | null;
}

export interface NotifyOpts {
  niche: string;
  cronRunId: string;
  candidates: ApparelCandidate[];
  failures?: number;
}

function getAdminChatIds(): number[] {
  // notifyAdmins ile aynı env kullanılır (ALLOWED_TELEGRAM_USER_IDS) — tek
  // source of truth, yeni env eklemeye gerek yok.
  return (process.env.ALLOWED_TELEGRAM_USER_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

function printifyLink(productId: string): string {
  return `https://printify.com/app/store/products/${productId}`;
}

/** Günlük candidate listesini Telegram'a gönder. */
export async function notifyApparelCandidates(opts: NotifyOpts): Promise<void> {
  const chatIds = getAdminChatIds();
  if (chatIds.length === 0) {
    console.warn('[apparel-notify] ALLOWED_TELEGRAM_USER_IDS env yok, mesaj atılmadı');
    return;
  }

  // 1) Header mesajı
  const header = [
    `📅 *Günün Apparel Candidate'leri* — ${opts.cronRunId}`,
    `Niche: *${opts.niche}*`,
    `Üretilen: ${opts.candidates.length}${opts.failures ? ` (${opts.failures} fail)` : ''}`,
    ``,
    `Aşağıda ${opts.candidates.length} mockup. Beğendiğini Printify link'ten aç → "Publish" → Etsy'ye gider.`,
    `Parça B (yakında): /approve_<id> ile tek komutla Etsy'ye gönderme.`,
  ].join('\n');

  for (const chatId of chatIds) {
    await sendMessage({ chatId, text: header, parseMode: 'Markdown' }).catch((err) =>
      console.warn(`[apparel-notify] header chat ${chatId} fail:`, err instanceof Error ? err.message : String(err)),
    );
  }

  // 2) Her candidate için ayrı mesaj
  for (const c of opts.candidates) {
    const sid = shortId(c.id);
    const extraImages: string[] = [];
    if (c.flat_lay_url) extraImages.push(`🎨 Flat lay: ${c.flat_lay_url}`);
    if (c.color_grid_url) extraImages.push(`🌈 Color grid: ${c.color_grid_url}`);
    if (c.size_chart_url) extraImages.push(`📏 Size chart: ${c.size_chart_url}`);

    const caption = [
      `*${c.slogan}*`,
      `_${c.theme}_`,
      `style: ${c.style} | demand: ${c.demand_hint ?? '?'}`,
      c.inspired_by ? `inspired: ${c.inspired_by}` : '',
      ``,
      `🆔 ${sid}`,
      `🔗 ${printifyLink(c.printify_product_id)}`,
      ...(extraImages.length > 0 ? ['', '*Ek görseller (Etsy listing\'e ekle):*', ...extraImages] : []),
    ].filter(Boolean).join('\n');

    for (const chatId of chatIds) {
      try {
        if (c.printify_preview_url) {
          await sendPhoto({ chatId, photo: c.printify_preview_url, caption, parseMode: 'Markdown' });
        } else {
          await sendMessage({ chatId, text: caption, parseMode: 'Markdown' });
        }
      } catch (err) {
        console.warn(
          `[apparel-notify] candidate ${sid} chat ${chatId} fail:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
