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
        { text: '✓ Alle planen', callback_data: `plan_approve_all:${planId}` },
        { text: '✏️ Slot bearbeiten', callback_data: `plan_edit:${planId}` },
      ],
      [
        { text: '🔄 Plan neu', callback_data: `plan_regen:${planId}` },
        { text: '✗ Verwerfen', callback_data: `plan_discard:${planId}` },
      ],
    ],
  };
}

export function slotEditKeyboard(slotId: string, planId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Genehmigen', callback_data: `slot_approve:${slotId}` },
        { text: '🔄 Neues Thema', callback_data: `slot_regen_topic:${slotId}` },
      ],
      [
        { text: '📝 Text bearbeiten', callback_data: `slot_edit_text:${slotId}` },
        { text: '✗ Löschen', callback_data: `slot_delete:${slotId}` },
      ],
      [
        { text: '← Zurück', callback_data: `plan_view:${planId}` },
      ],
    ],
  };
}
