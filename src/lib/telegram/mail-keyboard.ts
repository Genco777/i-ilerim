import type { InlineKeyboardMarkup } from './bot';

export function mailPreviewKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Gönder', callback_data: `mail_send:${draftId}` },
        { text: '🔄 Yeniden yaz', callback_data: `mail_regen:${draftId}` },
      ],
      [
        { text: '📎 Dosya ekle', callback_data: `mail_attach:${draftId}` },
        { text: '✗ İptal', callback_data: `mail_cancel:${draftId}` },
      ],
    ],
  };
}
