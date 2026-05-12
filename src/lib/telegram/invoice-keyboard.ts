import type { InlineKeyboardMarkup } from './bot';

export function invoiceTypeKeyboard(): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '✓ Rechnung (varsayılan)', callback_data: 'inv_type:rechnung' }],
      [
        { text: 'Teilrechnung', callback_data: 'inv_type:teilrechnung' },
        { text: 'Schlussrechnung', callback_data: 'inv_type:schlussrechnung' },
      ],
      [{ text: '✗ İptal', callback_data: 'inv_cancel:active' }],
    ],
  };
}

export function schlussrechnungAnzahlungKeyboard(
  draftId: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '➕ Var, ekleyeceğim',
          callback_data: `inv_anzahlung_add:${draftId}`,
        },
        {
          text: '✓ Yok, atla',
          callback_data: `inv_anzahlung_skip:${draftId}`,
        },
      ],
    ],
  };
}

export function invoiceItemMoreKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '➕ Evet, kalem ekle', callback_data: `inv_item_more:${draftId}` },
        {
          text: '✓ Hayır, devam',
          callback_data: `inv_no_more_items:${draftId}`,
        },
      ],
    ],
  };
}

export function invoiceFooterKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: 'Zahlbar 7 Tage',
          callback_data: `inv_fp:${draftId}:p1`,
        },
      ],
      [
        {
          text: 'Anzahlung 50%',
          callback_data: `inv_fp:${draftId}:p2`,
        },
      ],
      [
        { text: '✏️ Manuel yaz', callback_data: `inv_footer_manual:${draftId}` },
        { text: '— Not yok', callback_data: `inv_footer_skip:${draftId}` },
      ],
    ],
  };
}

export function invoiceNumberKeyboard(
  draftId: string,
  autoNumber: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: `✓ ${autoNumber}`,
          callback_data: `inv_number_auto:${draftId}`,
        },
        {
          text: '✏️ Değiştir',
          callback_data: `inv_number_manual:${draftId}`,
        },
      ],
    ],
  };
}

export function invoicePreviewKeyboard(
  invoiceId: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '📧 Müşteriye mail at',
          callback_data: `inv_send_mail:${invoiceId}`,
        },
      ],
      [
        { text: '💾 Sadece kaydet', callback_data: `inv_save:${invoiceId}` },
        { text: '🔄 Yeniden başla', callback_data: `inv_restart:${invoiceId}` },
      ],
      [{ text: '🗑 Sil', callback_data: `inv_delete:${invoiceId}` }],
    ],
  };
}

export function angebotFooterKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: 'Angebot freibleibend',
          callback_data: `ang_fp:${draftId}:ap1`,
        },
      ],
      [
        { text: '✏️ Manuel yaz', callback_data: `ang_footer_manual:${draftId}` },
        { text: '— Not yok', callback_data: `ang_footer_skip:${draftId}` },
      ],
    ],
  };
}

export function angebotNumberKeyboard(
  draftId: string,
  autoNumber: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: `✓ ${autoNumber}`,
          callback_data: `ang_number_auto:${draftId}`,
        },
        {
          text: '✏️ Değiştir',
          callback_data: `ang_number_manual:${draftId}`,
        },
      ],
    ],
  };
}

export function angebotPreviewKeyboard(
  angebotId: string,
): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: '📧 Müşteriye mail at',
          callback_data: `ang_send_mail:${angebotId}`,
        },
      ],
      [
        { text: '💾 Sadece kaydet', callback_data: `ang_save:${angebotId}` },
        { text: '🔄 Faturaya çevir', callback_data: `ang_convert:${angebotId}` },
      ],
      [
        { text: '🔄 Yeniden başla', callback_data: `ang_restart:${angebotId}` },
        { text: '🗑 Sil', callback_data: `ang_delete:${angebotId}` },
      ],
    ],
  };
}
