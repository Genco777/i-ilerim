import type { InlineKeyboardMarkup } from './bot';

export function actionMenuKeyboard(
  threadId: string,
  gapTopic: string | null,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup['inline_keyboard'] = [
    [
      { text: '💡 AI öner', callback_data: `kz_suggest:${threadId}` },
      { text: '🤔 3 alternatif', callback_data: `kz_alts:${threadId}` },
    ],
    [
      { text: '✏️ Kendim yaz', callback_data: `kz_custom:${threadId}` },
      { text: '❌ Reddet', callback_data: `kz_reject:${threadId}` },
    ],
  ];
  if (gapTopic) {
    rows.push([
      {
        text: `🔧 "${gapTopic.slice(0, 24)}" konusunu çöz`,
        callback_data: `kz_gap_open:${threadId}`,
      },
    ]);
  }
  return { inline_keyboard: rows };
}

export function previewKeyboard(
  threadId: string,
  attachCount: number,
): InlineKeyboardMarkup {
  const attachLabel = attachCount > 0 ? `📎 Görsel (${attachCount})` : '📎 Görsel ekle';
  return {
    inline_keyboard: [
      [
        { text: '✅ Gönder', callback_data: `kz_send:${threadId}` },
        { text: '✏️ Düzenle', callback_data: `kz_edit:${threadId}` },
      ],
      [
        { text: '🔄 Tekrar üret', callback_data: `kz_regen:${threadId}` },
        { text: attachLabel, callback_data: `kz_attach:${threadId}` },
      ],
      [
        { text: '🔙 Geri', callback_data: `kz_back:${threadId}` },
      ],
    ],
  };
}

export function alternativesKeyboard(threadId: string, count: number): InlineKeyboardMarkup {
  const numbers: InlineKeyboardMarkup['inline_keyboard'][number] = [];
  for (let i = 0; i < count; i++) {
    numbers.push({ text: String(i + 1), callback_data: `kz_alt_pick:${threadId}:${i}` });
  }
  return {
    inline_keyboard: [
      numbers,
      [{ text: '🔙 Geri', callback_data: `kz_back:${threadId}` }],
    ],
  };
}

export function alternativeTypesKeyboard(threadId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🪶 Kısa & rahat', callback_data: `kz_alt_type:${threadId}:short` }],
      [{ text: '📋 Detaylı + fiyat', callback_data: `kz_alt_type:${threadId}:detailed` }],
      [{ text: '❓ Önce soru sor', callback_data: `kz_alt_type:${threadId}:question` }],
      [{ text: '🔙 Geri', callback_data: `kz_back:${threadId}` }],
    ],
  };
}

export function gapResolveKeyboard(threadId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Evet sunuyorum', callback_data: `kz_gap_yes:${threadId}` },
        { text: '❌ Sunmuyorum', callback_data: `kz_gap_no:${threadId}` },
      ],
      [
        { text: '⏭️ Şimdilik atla', callback_data: `kz_gap_skip:${threadId}` },
      ],
    ],
  };
}

export function attachmentClearKeyboard(threadId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🗑 Görselleri temizle', callback_data: `kz_attach_clear:${threadId}` }],
      [{ text: '🔙 Geri', callback_data: `kz_attach_done:${threadId}` }],
    ],
  };
}
