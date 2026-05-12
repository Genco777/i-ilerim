import type { InlineKeyboardMarkup } from './bot';
import type { AdsWizardStep } from '@/lib/db/queries/ads-drafts';

export function campaignTypeKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔎 Search', callback_data: `ads_type:${draftId}:search` },
        { text: '⚡ Performance Max', callback_data: `ads_type:${draftId}:pmax` },
      ],
      [
        { text: '🖼️ Display', callback_data: `ads_type:${draftId}:display` },
        { text: '🔁 Retargeting', callback_data: `ads_type:${draftId}:retargeting` },
      ],
      [
        { text: '📍 Local', callback_data: `ads_type:${draftId}:local` },
      ],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function conversionGoalKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📝 Lead form', callback_data: `ads_goal:${draftId}:lead_form` },
        { text: '💬 WhatsApp', callback_data: `ads_goal:${draftId}:whatsapp` },
      ],
      [
        { text: '📞 Arama', callback_data: `ads_goal:${draftId}:call` },
        { text: '🛒 Satın alma', callback_data: `ads_goal:${draftId}:purchase` },
      ],
      [{ text: '— Hedef seçme', callback_data: `ads_goal:${draftId}:none` }],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function adsPreviewKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Onayla & oluştur', callback_data: `ads_approve:${draftId}` },
        { text: '🔄 Yeniden üret', callback_data: `ads_regen:${draftId}` },
      ],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function adsCancelKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }]],
  };
}

const STEP_ORDER: AdsWizardStep[] = ['type', 'target', 'budget', 'copy_review', 'approval'];

export function nextStep(current: AdsWizardStep): AdsWizardStep | null {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx === STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1]!;
}
