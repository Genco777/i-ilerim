import type { InlineKeyboardMarkup } from './bot';

// Preview keyboard for AI-generated post: 4 buttons.
export function previewKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Şimdi yayınla', callback_data: `approve:${postId}` },
        { text: '🔄 Görseli yenile', callback_data: `regen_image:${postId}` },
      ],
      [
        { text: '📝 Metni yenile', callback_data: `regen_text:${postId}` },
        { text: '✗ Sil', callback_data: `delete:${postId}` },
      ],
    ],
  };
}

// Raw mode keyboard: only approve / cancel.
export function rawKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Yayınla', callback_data: `approve:${postId}` },
        { text: '✗ İptal', callback_data: `delete:${postId}` },
      ],
    ],
  };
}

// Manual-image: ask whether to overlay logo.
export function logoChoiceKeyboard(postId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Logo bindir', callback_data: `set_logo:${postId}:on` },
        { text: '✗ Logo yok', callback_data: `set_logo:${postId}:off` },
      ],
    ],
  };
}
