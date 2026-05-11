import type { InlineKeyboardMarkup } from './bot';

// Preview keyboard for AI-generated content (post or story).
// Story uses a different approve action so the callback dispatcher
// can pick the right publishStory vs publishPost path.
export function previewKeyboard(
  postId: string,
  variant: 'post' | 'story' = 'post',
): InlineKeyboardMarkup {
  const approveAction = variant === 'story' ? 'approve_story' : 'approve';
  const scheduleAction = variant === 'story' ? 'schedule_story' : 'schedule';
  return {
    inline_keyboard: [
      [
        { text: '✓ Şimdi yayınla', callback_data: `${approveAction}:${postId}` },
        { text: '⏰ Plana göre', callback_data: `${scheduleAction}:${postId}` },
      ],
      [
        { text: '🔄 Görseli yenile', callback_data: `regen_image:${postId}` },
        { text: '📝 Metni yenile', callback_data: `regen_text:${postId}` },
      ],
      [
        { text: '✏️ Metni düzenle', callback_data: `edit_text:${postId}` },
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

// ───── Email Marketing ─────

export function emailDigestKeyboard(planId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📧 Bana test gönder', callback_data: `email_digest_test:${planId}` },
        { text: '📋 Listeye gönder', callback_data: `email_digest_send:${planId}` },
      ],
      [
        { text: '✗ İptal', callback_data: `email_digest_cancel:${planId}` },
      ],
    ],
  };
}

export function emailOutreachKeyboard(
  city: string,
  service: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📧 Bana test gönder', callback_data: `email_outreach_test:${city}:${service}` },
        { text: '📋 Listeye gönder', callback_data: `email_outreach_send:${city}:${service}` },
      ],
      [
        { text: '✗ İptal', callback_data: `email_outreach_cancel:${city}:${service}` },
      ],
    ],
  };
}

// Inbound-message keyboard: send / edit / ignore the AI-drafted reply.
export function replyKeyboard(messageId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📤 Gönder', callback_data: `send_reply:${messageId}` },
        { text: '✏️ Düzenle', callback_data: `edit_reply:${messageId}` },
        { text: '🚫 Yoksay', callback_data: `ignore_msg:${messageId}` },
      ],
    ],
  };
}
