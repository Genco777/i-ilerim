/**
 * apparel-notify.ts — Sprint K Faz 6
 *
 * Telegram'a günlük apparel candidate notification gönderir. notifyAdmins
 * pattern'ini takip eder (ADMIN_TELEGRAM_CHAT_IDS env'inden alıcılar).
 *
 * Parça A: manual onay — Mehmet Printify dashboard link'ini tıklar, Etsy
 * publish butonuna basar. Parça B'de /approve_<id> /reject_<id> komutları.
 */

import { sendMessage, sendPhoto, type InlineKeyboardMarkup } from './bot';

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
    `Her ürün için aşağıdaki butonlar:`,
    `✅ Onayla → Etsy'ye gönderir + Kling video üretir`,
    `❌ Sil → Printify'dan silinir`,
    `🌈/📏 → Ek görselleri tarayıcıda açar`,
  ].join('\n');

  for (const chatId of chatIds) {
    await sendMessage({ chatId, text: header, parseMode: 'Markdown' }).catch((err) =>
      console.warn(`[apparel-notify] header chat ${chatId} fail:`, err instanceof Error ? err.message : String(err)),
    );
  }

  // 2) Her candidate — flat lay COVER + caption + inline keyboard
  for (const c of opts.candidates) {
    const sid = shortId(c.id);

    const caption = [
      `*${c.slogan}*`,
      `_${c.theme}_`,
      `style: ${c.style} | demand: ${c.demand_hint ?? '?'}`,
      c.inspired_by ? `inspired: ${c.inspired_by}` : '',
      ``,
      `🆔 ${sid}`,
    ].filter(Boolean).join('\n');

    // Inline keyboard — onayla/sil callback + extra image URL buttons
    const keyboardRows: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
    keyboardRows.push([
      { text: '✅ Onayla', callback_data: `apparel:approve:${sid}` },
      { text: '❌ Sil', callback_data: `apparel:reject:${sid}` },
    ]);
    const extraButtons: Array<{ text: string; url: string }> = [];
    if (c.color_grid_url) extraButtons.push({ text: '🌈 Color Grid', url: c.color_grid_url });
    if (c.size_chart_url) extraButtons.push({ text: '📏 Size Chart', url: c.size_chart_url });
    if (extraButtons.length > 0) keyboardRows.push(extraButtons);
    keyboardRows.push([{ text: '🛍 Printify', url: printifyLink(c.printify_product_id) }]);

    const replyMarkup: InlineKeyboardMarkup = { inline_keyboard: keyboardRows };

    // COVER PHOTO = flat lay (lifestyle), yoksa Printify preview fallback
    const coverPhoto = c.flat_lay_url ?? c.printify_preview_url;

    for (const chatId of chatIds) {
      try {
        if (coverPhoto) {
          await sendPhoto({
            chatId,
            photo: coverPhoto,
            caption,
            parseMode: 'Markdown',
            replyMarkup,
          });
        } else {
          await sendMessage({
            chatId,
            text: caption,
            parseMode: 'Markdown',
            replyMarkup,
          });
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
