/**
 * Inline keyboard for trend-engine product approval (Faz 2-A).
 *
 * Callback data format: `trend_<action>:<productId>[:<extra>]`
 * Routed in src/app/api/telegram/webhook/[secret]/route.ts handleCallback.
 *
 * Buttons:
 *   ✅ Onayla        → status='approved' (Faz 3 will pick this up)
 *   ❌ Reddet        → asks for reason, stores rejected_reason, status='rejected'
 *   🔄 Görseli Yenile → regenerate hero image, replace photo
 *   ✏️ Başlığı Düzelt → asks for new shop_title, updates DB
 */

import type { InlineKeyboardMarkup } from './bot';

export function productApprovalKeyboard(productId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Onayla', callback_data: `trend_approve:${productId}` },
        { text: '❌ Reddet', callback_data: `trend_reject:${productId}` },
      ],
      [
        { text: '🔄 Görseli Yenile', callback_data: `trend_regen_visual:${productId}` },
        { text: '✏️ Başlığı Düzelt', callback_data: `trend_edit_title:${productId}` },
      ],
    ],
  };
}

/**
 * Empty keyboard — used to clear buttons after a final action (approve/reject).
 */
export function clearedKeyboard(): InlineKeyboardMarkup {
  return { inline_keyboard: [] };
}
