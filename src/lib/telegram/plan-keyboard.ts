import type { InlineKeyboardMarkup } from './bot';

export function planOverviewKeyboard(planId: string, isApproved = false): InlineKeyboardMarkup {
  if (isApproved) {
    return {
      inline_keyboard: [
        [
          { text: '📋 Planı görüntüle', callback_data: `plan_view:${planId}` },
          { text: '↩️ Planı iptal et', callback_data: `plan_cancel:${planId}` },
        ],
      ],
    };
  }

  return {
    inline_keyboard: [
      [
        { text: '✓ Tümünü onayla', callback_data: `plan_approve_all:${planId}` },
        { text: '✏️ Slot düzenle', callback_data: `plan_edit:${planId}` },
      ],
      [
        { text: '🔄 Planı yenile', callback_data: `plan_regen:${planId}` },
        { text: '✗ İptal et', callback_data: `plan_discard:${planId}` },
      ],
    ],
  };
}

export function slotEditKeyboard(slotId: string, planId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Onayla', callback_data: `slot_approve:${slotId}` },
        { text: '🔄 Konu yenile', callback_data: `slot_regen_topic:${slotId}` },
      ],
      [
        { text: '📝 Metin düzenle', callback_data: `slot_edit_text:${slotId}` },
        { text: '✗ Sil', callback_data: `slot_delete:${slotId}` },
      ],
      [
        { text: '← Geri', callback_data: `plan_view:${planId}` },
      ],
    ],
  };
}
