import { NextResponse } from 'next/server';
import {
  sendMessage,
  sendPhoto,
  sendDocument,
  answerCallbackQuery,
  editMessageReplyMarkup,
  editMessageText,
  getFile,
  downloadFile,
} from '@/lib/telegram/bot';
import {
  previewKeyboard,
  rawKeyboard,
  replyKeyboard,
  emailDigestKeyboard,
  emailOutreachKeyboard,
} from '@/lib/telegram/keyboard';
import { mailPreviewKeyboard } from '@/lib/telegram/mail-keyboard';
import {
  invoiceTypeKeyboard,
  invoiceItemMoreKeyboard,
  invoiceFooterKeyboard,
  invoiceNumberKeyboard,
  invoicePreviewKeyboard,
  schlussrechnungAnzahlungKeyboard,
} from '@/lib/telegram/invoice-keyboard';
import {
  cancelActiveDrafts as cancelActiveInvoiceDrafts,
  createDraft as createInvoiceDraft,
  getActiveDraft as getActiveInvoiceDraft,
  getInvoice,
  updateDraft as updateInvoiceDraft,
  appendItem as appendInvoiceItem,
  setPendingItem as setInvoicePendingItem,
  setRecipient as setInvoiceRecipient,
  markPreview as markInvoicePreview,
  markSent as markInvoiceSent,
  markCancelled as markInvoiceCancelled,
  markDeleted as markInvoiceDeleted,
  getInvoiceByNumber,
} from '@/lib/db/queries/invoices';
import { renderInvoicePdf } from '@/lib/invoice/pdf';
import { generateInvoiceCoverLetter } from '@/lib/invoice/cover-letter';
import {
  formatCents,
  INVOICE_TYPE_LABEL,
  todayDDMMYYYY,
  type InvoiceData,
  type InvoiceType as InvoiceTypeUnion,
} from '@/lib/invoice/types';
import {
  nextInvoiceNumber,
  parseInvoiceNumber,
} from '@/lib/invoice/numbering';
import type { Invoice } from '@/types';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import {
  createPlan,
  getPlan,
  getPlanByWeek,
  updatePlan,
  approvePlan,
  getSlotsByPlan,
  updateSlot,
  deleteSlot,
  getSlot,
} from '@/lib/db/queries/plans';
import { planOverviewKeyboard, slotEditKeyboard } from '@/lib/telegram/plan-keyboard';
import {
  generatePost,
  regenerateImage,
  regenerateText,
} from '@/lib/content/generate-post';
import { generateWeeklyPlan, formatPlanForTelegram, getCurrentWeek } from '@/lib/content/generate-plan';
import { getPost, deletePost } from '@/lib/db/queries/posts';
import { publishPost, publishStory } from '@/lib/meta/publisher';
import {
  getIncomingMessage,
  updateIncomingMessage,
} from '@/lib/db/queries/messages';
import {
  approveAndSendReply,
  ignoreMessage,
} from '@/lib/messages/reply-manager';
import { parseMailCommand } from '@/lib/mail/parse-mail-command';
import {
  runWeeklyEmailCampaign,
  runCityOutreach,
  slotsToPortfolioItems,
  sendPortfolioNewsletter,
  sendReactivation,
} from '@/lib/email/campaigns';
import { weeklyDigest, portfolioNewsletter } from '@/lib/email/templates';
import type { DigestItem, PortfolioItem } from '@/lib/email/templates';
import { getLists, createContact, sendEmail } from '@/lib/email/brevo';
import { generateMailDraft } from '@/lib/mail/generate';
import { sendMail } from '@/lib/mail/smtp';
import {
  cancelActiveDrafts,
  createDraft,
  getActiveDraft,
  getDraft,
  updateDraft,
  markSent,
  markCancelled,
  addAttachment,
} from '@/lib/db/queries/mail-drafts';
import {
  getInboxById,
  setRepliedDraftId,
} from '@/lib/db/queries/mail-inbox';
import type { MailDraft, MailInbox } from '@/types';
import {
  getThread as getKleinanzeigenThread,
  updateThread as updateKleinanzeigenThread,
  getActiveThreadAwaitingText as getActiveKleinanzeigenThread,
  getActiveThreadAwaitingImage as getActiveKleinanzeigenImageThread,
  upsertOverride as upsertKleinanzeigenOverride,
  listOverrides as listKleinanzeigenOverrides,
  getConversationHistory as getKleinanzeigenHistory,
} from '@/lib/db/queries/kleinanzeigen';
import {
  generateSingleReply,
  generateStyledReply,
  refineReply,
  type ReplyStyle,
} from '@/lib/kleinanzeigen/reply';
import { sendKleinanzeigenReply } from '@/lib/kleinanzeigen/send';
import {
  actionMenuKeyboard as kzActionMenuKeyboard,
  previewKeyboard as kzPreviewKeyboard,
  alternativeTypesKeyboard as kzAlternativeTypesKeyboard,
  gapResolveKeyboard as kzGapResolveKeyboard,
  attachmentClearKeyboard as kzAttachmentClearKeyboard,
} from '@/lib/telegram/kleinanzeigen-keyboard';
import {
  buildInitialMessage as kzBuildInitialMessage,
  buildPreviewMessage as kzBuildPreviewMessage,
  buildGapPrompt as kzBuildGapPrompt,
  buildGapInfoPrompt as kzBuildGapInfoPrompt,
} from '@/lib/kleinanzeigen/telegram-ui';
import { clearProfileCache as clearKleinanzeigenProfileCache } from '@/lib/kleinanzeigen/profile';
import type { KleinanzeigenThread, KleinanzeigenAnalysis, MailAttachment } from '@/types';

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: { chat: { id: number }; message_id: number };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

function allowedUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function webhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET;
}

const HELP_TEXT = [
  '📋 Komut listesi:',
  '  /post <konu>            — AI metin + 1:1 görsel + FB Page + IG yayını',
  '  /story <konu>           — IG Story (9:16, sadece IG)',
  '  /raw <metin>            — manuel paylaşım (foto ekle, AI dokunmaz)',
  '  /mail <email> <talimat> — AI yardımıyla mail taslağı + Zoho gönder',
  '  /fatura                 — adım adım PDF fatura oluştur (DE), müşteriye mail at',
  '  /edit_reply <id> <text> — gelen mesaja taslak cevabı düzenle',
  '  /preview_reply <id>     — taslağı butonlu önizle',
  '  /poll                   — mail kutusunu hemen kontrol et (anlık tetikleme)',
  '  /refresh-profile        — fly-froth.com/llms.txt cache temizle',
  '  /export-overrides       — Telegram\'dan eklenen overrideleri JSON olarak ver',
  '  /haftalik-plan           — Haftalık IG+FB içerik planı oluştur (AI)',
  '  /plan-durum              — Bu haftanın plan durumunu göster',
  '  /email-digest            — Haftalık planı email bülteni olarak gönder',
  '  /email-outreach <şehir>  — Lokal business outreach emaili (19 şehir)',
  '  /email-reactivate <email> <isim> <proje> — Eski müşteriye yeniden aktivasyon maili',
  '  /email-lists             — Brevo email listelerini göster',
  '  /help                   — bu mesaj',
  '',
  'Yeni FB/IG yorumları otomatik olarak buraya bildirilir.',
  'Onay sonrası seçilen kanal(lar)a yayınlanır.',
].join('\n');

const START_TEXT = [
  '👋 Merhaba Mehmet! Fly & Froth bot aktif.',
  '',
  'Hızlı başlangıç:',
  '  /post Visitenkarten promosyonu, %20 indirim',
  '',
  '/help yazarak tüm komutları gör.',
].join('\n');

async function notifyError(chatId: number, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : 'Unknown error';
  try {
    await sendMessage({
      chatId,
      text: `🔴 Hata: ${msg.slice(0, 500)}`,
    });
  } catch {
    // swallow secondary errors
  }
}

async function kzReplyContextFromThread(thread: KleinanzeigenThread) {
  const analysis = (thread.ai_analysis as KleinanzeigenAnalysis | null) ?? {
    subject: 'Kleinanzeigen Nachricht',
    lang: 'de',
    tone_detected: 'unknown' as const,
    knowledge_gaps: [],
  };
  const history = await getKleinanzeigenHistory(thread.routing_token).catch(() => []);
  return {
    buyerName: thread.buyer_name,
    listingTitle: thread.listing_title,
    buyerMessage: thread.raw_body,
    analysis,
    history,
  };
}

async function kzShowPreview(
  chatId: number,
  thread: KleinanzeigenThread,
  draft: string,
  source: 'ai' | 'custom' | 'regen',
): Promise<void> {
  const updated = await updateKleinanzeigenThread(thread.id, {
    draft_reply: draft,
    status: 'drafting',
  });
  const history = await getKleinanzeigenHistory(updated.routing_token).catch(() => []);
  await sendMessage({
    chatId,
    text: kzBuildPreviewMessage(updated, draft, source, history.length),
    replyMarkup: kzPreviewKeyboard(updated.id, (updated.attachments ?? []).length),
  });
}

async function kzShowInitial(chatId: number, thread: KleinanzeigenThread): Promise<void> {
  const analysis = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const gapTopic = analysis?.knowledge_gaps[0] ?? null;
  await sendMessage({
    chatId,
    text: kzBuildInitialMessage(thread),
    replyMarkup: kzActionMenuKeyboard(thread.id, gapTopic),
  });
}

async function handleKzSuggest(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) { await sendMessage({ chatId, text: `❓ Thread bulunamadı: ${threadId}` }); return; }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: '💭 AI cevap üretiyor…' });
  try {
    const draft = await generateSingleReply(await kzReplyContextFromThread(thread));
    await kzShowPreview(chatId, thread, draft, 'ai');
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzAlternatives(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) { await sendMessage({ chatId, text: `❓ Thread bulunamadı: ${threadId}` }); return; }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({
    chatId,
    text: '🤔 Hangi tür cevap olsun?',
    replyMarkup: kzAlternativeTypesKeyboard(thread.id),
  });
}

async function handleKzAlternativeType(
  chatId: number,
  threadId: string,
  styleRaw: string,
): Promise<void> {
  const validStyles: ReplyStyle[] = ['short', 'detailed', 'question'];
  if (!validStyles.includes(styleRaw as ReplyStyle)) {
    await sendMessage({ chatId, text: `❓ Bilinmeyen tür: ${styleRaw}` });
    return;
  }
  const style = styleRaw as ReplyStyle;
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) { await sendMessage({ chatId, text: `❓ Thread bulunamadı: ${threadId}` }); return; }
  await sendMessage({ chatId, text: '💭 AI cevap üretiyor…' });
  try {
    const draft = await generateStyledReply(await kzReplyContextFromThread(thread), style);
    await kzShowPreview(chatId, thread, draft, 'ai');
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzCustom(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_custom' });
  await sendMessage({ chatId, text: '✏️ Cevabını yaz (sonra önizleme + Gönder butonu çıkacak):' });
}

async function handleKzReject(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await updateKleinanzeigenThread(thread.id, { status: 'rejected' });
  await sendMessage({ chatId, text: '❌ Reddedildi, cevap gönderilmedi.' });
}

async function handleKzSend(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.draft_reply) {
    await sendMessage({ chatId, text: '❌ Gönderilecek taslak yok.' });
    return;
  }
  if (thread.status === 'sent') {
    await sendMessage({ chatId, text: 'Bu cevap zaten gönderilmiş.' });
    return;
  }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const attachCount = (thread.attachments ?? []).length;
  await sendMessage({
    chatId,
    text: attachCount > 0
      ? `📤 Cevap gönderiliyor (${attachCount} görsel ekli)…`
      : '📤 Cevap gönderiliyor…',
  });
  try {
    const result = await sendKleinanzeigenReply(thread, thread.draft_reply);
    await updateKleinanzeigenThread(thread.id, {
      status: 'sent',
      final_reply: thread.draft_reply,
      sent_at: new Date(),
    });
    await sendMessage({
      chatId,
      text: [
        '✅ Cevap gönderildi.',
        `Kime: ${thread.buyer_name ?? thread.sender_address}`,
        `Message-ID: ${result.messageId}`,
      ].join('\n'),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzEdit(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_refinement' });
  await sendMessage({
    chatId,
    text: 'Nasıl olsun? (örn. "daha kısa", "fiyat 25€ olsun", "Animation kısmını çıkar")',
  });
}

async function handleKzRegen(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await sendMessage({ chatId, text: '🔄 Yeniden üretiliyor…' });
  try {
    const draft = await generateSingleReply(await kzReplyContextFromThread(thread));
    await kzShowPreview(chatId, thread, draft, 'regen');
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzBack(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_action' });
  await kzShowInitial(chatId, thread);
}

async function handleKzGapOpen(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  const analysis = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const topic = analysis?.knowledge_gaps[0];
  if (!topic) { await sendMessage({ chatId, text: 'Bu thread için bilgi boşluğu yok.' }); return; }
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: topic });
  await sendMessage({
    chatId,
    text: kzBuildGapPrompt(topic),
    replyMarkup: kzGapResolveKeyboard(thread.id),
  });
}

async function handleKzGapYes(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.pending_gap_topic) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_gap_info' });
  await sendMessage({ chatId, text: kzBuildGapInfoPrompt(thread.pending_gap_topic) });
}

async function handleKzGapNo(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.pending_gap_topic) return;
  await upsertKleinanzeigenOverride({
    topic: thread.pending_gap_topic,
    kind: 'not_offered',
    content: 'Bu hizmeti sunmuyoruz, nazikçe yönlendir.',
  });
  clearKleinanzeigenProfileCache();
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: null, status: 'awaiting_action' });
  await sendMessage({ chatId, text: '📝 Kaydettim. AI artık bu hizmeti reddedeceğini bilecek.' });
  await kzShowInitial(chatId, thread);
}

async function handleKzGapSkip(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: null, status: 'awaiting_action' });
  await sendMessage({ chatId, text: '⏭️ Atlandı (kaydedilmedi).' });
  await kzShowInitial(chatId, thread);
}

async function handleKzAttach(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_image' });
  const existing = (thread.attachments ?? []).length;
  const baseText = existing > 0
    ? `📎 Şu an ${existing} görsel ekli. Yeni görsel(ler) gönder veya temizle:`
    : '📎 Eklemek istediğin görsel(ler)i gönder (foto veya dosya, her biri max 20 MB). Bitince "Geri"ye bas.';
  await sendMessage({
    chatId,
    text: baseText,
    replyMarkup: kzAttachmentClearKeyboard(thread.id),
  });
}

async function handleKzAttachClear(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { attachments: [] });
  await sendMessage({ chatId, text: '🗑 Tüm görseller temizlendi.' });
}

async function handleKzAttachDone(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  if (thread.draft_reply) {
    await updateKleinanzeigenThread(thread.id, { status: 'drafting' });
    const history = await getKleinanzeigenHistory(thread.routing_token).catch(() => []);
    await sendMessage({
      chatId,
      text: kzBuildPreviewMessage(thread, thread.draft_reply, 'ai', history.length),
      replyMarkup: kzPreviewKeyboard(thread.id, (thread.attachments ?? []).length),
    });
  } else {
    await updateKleinanzeigenThread(thread.id, { status: 'awaiting_action' });
    await kzShowInitial(chatId, thread);
  }
}

async function kzAppendAttachment(
  chatId: number,
  thread: KleinanzeigenThread,
  file: { fileId: string; filename: string; mime: string; sizeBytes?: number },
): Promise<void> {
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.sizeBytes && file.sizeBytes > MAX_BYTES) {
    await sendMessage({ chatId, text: '❌ Dosya 20 MB sınırını aşıyor.' });
    return;
  }
  try {
    const info = await getFile(file.fileId);
    const buffer = await downloadFile(info.file_path);
    const current = thread.attachments ?? [];
    const next: MailAttachment[] = [
      ...current,
      { filename: file.filename, mime: file.mime, base64: buffer.toString('base64') },
    ];
    const updated = await updateKleinanzeigenThread(thread.id, { attachments: next });
    await sendMessage({
      chatId,
      text: `📎 Eklendi (${updated.attachments.length} görsel toplam). Bitince "Geri"ye bas.`,
      replyMarkup: kzAttachmentClearKeyboard(updated.id),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzTextInput(
  chatId: number,
  thread: KleinanzeigenThread,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    await sendMessage({ chatId, text: '⚠️ Boş mesaj yok sayıldı.' });
    return;
  }

  if (thread.status === 'awaiting_custom') {
    await kzShowPreview(chatId, thread, trimmed, 'custom');
    return;
  }

  if (thread.status === 'awaiting_refinement') {
    const previous = thread.draft_reply ?? '';
    await sendMessage({ chatId, text: '✏️ Yeniden yazılıyor…' });
    try {
      const draft = await refineReply({
        ctx: await kzReplyContextFromThread(thread),
        previousReply: previous,
        feedback: trimmed,
      });
      await kzShowPreview(chatId, thread, draft, 'regen');
    } catch (err) { await notifyError(chatId, err); }
    return;
  }

  if (thread.status === 'awaiting_gap_info' && thread.pending_gap_topic) {
    await upsertKleinanzeigenOverride({
      topic: thread.pending_gap_topic,
      kind: 'offered',
      content: trimmed,
    });
    clearKleinanzeigenProfileCache();
    const updated = await updateKleinanzeigenThread(thread.id, {
      pending_gap_topic: null,
      status: 'awaiting_action',
    });
    const { analyzeKleinanzeigenMessage } = await import('@/lib/kleinanzeigen/analyzer');
    try {
      const newAnalysis = await analyzeKleinanzeigenMessage(updated.raw_body);
      await updateKleinanzeigenThread(updated.id, { ai_analysis: newAnalysis });
    } catch {
      // non-fatal
    }
    const refreshed = await getKleinanzeigenThread(updated.id);
    await sendMessage({ chatId, text: '📝 Bilgi kaydedildi. Şimdi AI cevap önereyim mi?' });
    if (refreshed) await kzShowInitial(chatId, refreshed);
    return;
  }
}

async function handleRefreshProfileCommand(chatId: number): Promise<void> {
  clearKleinanzeigenProfileCache();
  try {
    const { fetchLlmsTxt } = await import('@/lib/kleinanzeigen/profile');
    const text = await fetchLlmsTxt();
    await sendMessage({
      chatId,
      text: ['🔄 Profil yenilendi.', `Boyut: ${text.length} karakter.`].join('\n'),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleExportOverridesCommand(chatId: number): Promise<void> {
  const overrides = await listKleinanzeigenOverrides();
  if (overrides.length === 0) {
    await sendMessage({ chatId, text: 'Henüz override yok.' });
    return;
  }
  const lines = overrides.map(
    (o) => `- [${o.kind}] ${o.topic}: ${o.content.replace(/\n/g, ' ')}`,
  );
  const blob = ['## Zusätzliche Hinweise (Telegram overrides)', '', ...lines].join('\n');
  await sendMessage({
    chatId,
    text: ['📋 Mevcut overrideler (llms.txt\'e ekleyebilirsin):', '', blob.slice(0, 3500)].join('\n'),
  });
}

async function handlePollCommand(chatId: number): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    await sendMessage({ chatId, text: '❌ CRON_SECRET env değişkeni Vercel\'de set değil.' });
    return;
  }
  await sendMessage({ chatId, text: '🔄 Mail kutusu kontrol ediliyor…' });
  try {
    const res = await fetch('https://admin.fly-froth.com/api/mail/poll-inbox', {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    const data = (await res.json()) as {
      ok?: boolean;
      fetched?: number;
      notified?: number;
      errors?: unknown[];
    };
    if (!res.ok || !data.ok) {
      await sendMessage({
        chatId,
        text: `❌ Poll başarısız (${res.status}): ${JSON.stringify(data).slice(0, 500)}`,
      });
      return;
    }
    const fetched = data.fetched ?? 0;
    const notified = data.notified ?? 0;
    const errs = Array.isArray(data.errors) ? data.errors.length : 0;
    if (fetched === 0) {
      await sendMessage({ chatId, text: '✅ Yeni mail yok.' });
    } else {
      const errLine = errs > 0 ? `\n⚠️ ${errs} hata da var (loglara bak).` : '';
      await sendMessage({
        chatId,
        text: `✅ ${fetched} mail yakalandı, ${notified} bildirim gönderildi.${errLine}`,
      });
    }
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handlePostCommand(
  chatId: number,
  messageId: number,
  topic: string,
  channel: 'post' | 'ig_story' = 'post',
): Promise<void> {
  const isStory = channel === 'ig_story';
  await sendMessage({
    chatId,
    text: isStory
      ? `📖 Story üretiliyor (9:16): "${topic}"\n(15-30 saniye…)`
      : `🎨 Üretiliyor: "${topic}"\n(15-30 saniye sürer, biraz bekle…)`,
  });

  try {
    const post = await generatePost({
      topic,
      telegramChatId: String(chatId),
      telegramMessageId: String(messageId),
      channel,
    });

    const caption = [
      post.text_de,
      '',
      (post.hashtags ?? [])
        .map((h) => `#${h.replace(/^#/, '')}`)
        .join(' '),
    ].join('\n');

    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: caption.slice(0, 1024),
      replyMarkup: previewKeyboard(post.id, isStory ? 'story' : 'post'),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleRawCommand(chatId: number): Promise<void> {
  await sendMessage({
    chatId,
    text: [
      '/raw modu için fotoğraf gerekli.',
      '',
      'Telegram\'da bir fotoğraf yükle, caption alanına başlangıçta /raw yazıp metnini ekle:',
      '',
      '/raw Frohe Weihnachten von Fly & Froth! 🎄',
      '(+ ekli fotoğraf)',
    ].join('\n'),
  });
}

async function handlePhotoMessage(
  msg: TelegramMessage,
): Promise<void> {
  const chatId = msg.chat.id;
  const photo = msg.photo?.[msg.photo.length - 1];
  if (!photo) return;

  const captionRaw = msg.caption?.trim() ?? '';
  const isRaw = captionRaw.startsWith('/raw');
  const caption = isRaw
    ? captionRaw.replace(/^\/raw(@\w+)?\s*/, '').trim()
    : captionRaw;

  if (!caption) {
    await sendMessage({
      chatId,
      text: isRaw
        ? '/raw modu metin (caption) gerektirir.'
        : 'Foto için caption (konu) gerekli.',
    });
    return;
  }

  await sendMessage({
    chatId,
    text: isRaw
      ? '📤 /raw modu — fotoğraf yükleniyor (AI dokunmaz)…'
      : '🎨 Fotoğrafı kullanıyorum, AI sadece metni üretiyor…',
  });

  try {
    const fileInfo = await getFile(photo.file_id);
    const buffer = await downloadFile(fileInfo.file_path);

    if (isRaw) {
      // Mod 3: no AI, no logo overlay.
      const post = await generatePost({
        topic: '',
        rawMode: true,
        rawText: caption,
        manualImageBuffer: buffer,
        telegramChatId: String(chatId),
        telegramMessageId: String(msg.message_id),
      });
      await sendPhoto({
        chatId,
        photo: post.final_image_url,
        caption: `📌 Raw mod — yayına gönderilecek metin:\n\n${post.text_de.slice(0, 900)}`,
        replyMarkup: rawKeyboard(post.id),
      });
      return;
    }

    // Mod 2: manual image + AI text.
    const kit = await getBrandKit();
    const noLogo = kit.manual_upload_logo_default === 'never';

    const post = await generatePost({
      topic: caption,
      manualImageBuffer: buffer,
      noLogo,
      telegramChatId: String(chatId),
      telegramMessageId: String(msg.message_id),
    });

    const fullCaption = [
      post.text_de,
      '',
      (post.hashtags ?? [])
        .map((h) => `#${h.replace(/^#/, '')}`)
        .join(' '),
    ]
      .join('\n')
      .slice(0, 1024);

    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: fullCaption,
      replyMarkup: previewKeyboard(post.id),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleApprove(
  chatId: number,
  messageId: number,
  postId: string,
  isStory: boolean,
): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({
    chatId,
    text: isStory ? '📤 IG Story yayınlanıyor…' : '📤 Yayınlanıyor (FB Page + IG)…',
  });

  try {
    const result = isStory
      ? await publishStory(postId)
      : await publishPost(postId);

    await sendMessage({
      chatId,
      text: isStory
        ? [
            '✅ IG Story yayınlandı!',
            `📷 IG media id: ${result.igPostId}`,
            '(Story Instagram\'da 24 saat görünür)',
          ].join('\n')
        : [
            '✅ Yayınlandı!',
            '',
            `📘 FB:  https://facebook.com/${result.fbPostId}`,
            result.igShortcode
              ? `📷 IG:  https://instagram.com/p/${result.igShortcode}`
              : `📷 IG media id: ${result.igPostId}`,
          ].join('\n'),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleRegenImage(
  chatId: number,
  postId: string,
): Promise<void> {
  await sendMessage({ chatId, text: '🔄 Görsel yeniden üretiliyor…' });
  try {
    const post = await regenerateImage(postId);
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: 'Yeni görsel hazır. Onayla?',
      replyMarkup: previewKeyboard(post.id),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleRegenText(
  chatId: number,
  postId: string,
): Promise<void> {
  await sendMessage({ chatId, text: '📝 Metin yeniden üretiliyor…' });
  try {
    const post = await regenerateText(postId);
    const caption = [
      post.text_de,
      '',
      (post.hashtags ?? [])
        .map((h) => `#${h.replace(/^#/, '')}`)
        .join(' '),
    ].join('\n');
    await sendMessage({
      chatId,
      text: `Yeni metin:\n\n${caption.slice(0, 3500)}`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleDelete(
  chatId: number,
  messageId: number,
  postId: string,
): Promise<void> {
  await deletePost(postId);
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: `🗑️ ${postId} silindi.` });
}

async function handleSendReply(
  chatId: number,
  messageId: number,
  msgId: string,
): Promise<void> {
  const message = await getIncomingMessage(msgId);
  if (!message) {
    await sendMessage({ chatId, text: `❓ Mesaj bulunamadı: ${msgId}` });
    return;
  }
  const draft = (message.final_reply ?? message.draft_reply ?? '').trim();
  if (!draft) {
    await sendMessage({
      chatId,
      text: '❌ Taslak yok. Önce "Düzenle" ile cevap yaz.',
    });
    return;
  }

  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: '📤 Cevap gönderiliyor…' });

  try {
    const { message: updated, reply_external_id } = await approveAndSendReply(
      msgId,
      draft,
    );
    await sendMessage({
      chatId,
      text: [
        '✅ Cevap gönderildi.',
        `Kanal: ${updated.platform}`,
        `Reply ID: ${reply_external_id}`,
      ].join('\n'),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleEditReplyPrompt(
  chatId: number,
  msgId: string,
): Promise<void> {
  const message = await getIncomingMessage(msgId);
  if (!message) {
    await sendMessage({ chatId, text: `❓ Mesaj bulunamadı: ${msgId}` });
    return;
  }
  await sendMessage({
    chatId,
    text: [
      `✏️ ${msgId} için yeni cevap metnini gönder:`,
      '',
      `Kullanım: /edit_reply ${msgId} <metin>`,
      '',
      'Mevcut taslak:',
      message.draft_reply ?? '(yok)',
    ].join('\n'),
  });
}

async function handleEditReplyCommand(
  chatId: number,
  rest: string,
): Promise<void> {
  // Format: /edit_reply <msgId> <text>
  const trimmed = rest.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    await sendMessage({
      chatId,
      text: 'Kullanım: /edit_reply <msgId> <yeni cevap metni>',
    });
    return;
  }
  const msgId = trimmed.slice(0, spaceIdx).trim();
  const newText = trimmed.slice(spaceIdx + 1).trim();
  if (!msgId || !newText) {
    await sendMessage({
      chatId,
      text: 'Kullanım: /edit_reply <msgId> <yeni cevap metni>',
    });
    return;
  }

  try {
    await updateIncomingMessage(msgId, { draft_reply: newText });
    await sendMessage({
      chatId,
      text: [
        '✅ Taslak güncellendi.',
        '',
        '🤖 Yeni cevap:',
        `"${newText}"`,
        '',
        `Göndermek için: send_reply:${msgId} (önceki bildirimdeki "📤 Gönder" butonu)`,
        'Veya yeni bir butonlu önizleme istemek için:',
        `/preview_reply ${msgId}`,
      ].join('\n'),
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handlePreviewReplyCommand(
  chatId: number,
  msgId: string,
): Promise<void> {
  const message = await getIncomingMessage(msgId);
  if (!message) {
    await sendMessage({ chatId, text: `❓ Mesaj bulunamadı: ${msgId}` });
    return;
  }
  const draft = message.draft_reply ?? '(taslak yok)';
  await sendMessage({
    chatId,
    text: [
      `💬 ${message.platform} — ${message.sender_name}:`,
      `"${message.message_text.slice(0, 500)}"`,
      '',
      '🤖 Taslak:',
      `"${draft}"`,
    ].join('\n'),
    replyMarkup: replyKeyboard(msgId),
  });
}

async function handleIgnoreMessage(
  chatId: number,
  messageId: number,
  msgId: string,
): Promise<void> {
  try {
    await ignoreMessage(msgId);
    await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
    await sendMessage({ chatId, text: `🚫 Mesaj yoksayıldı: ${msgId}` });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

// ───── /mail outbound flow ─────

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function formatMailPreview(draft: MailDraft): string {
  const attachLine =
    draft.attachments.length > 0
      ? `📎 ${draft.attachments.length} dosya: ${draft.attachments
          .map((a) => a.filename)
          .join(', ')}\n\n`
      : '';
  return [
    `📧 Kime: ${draft.to_email}`,
    `📝 Konu: ${draft.subject ?? '(yok)'}`,
    '',
    attachLine + (draft.body ?? ''),
  ]
    .join('\n')
    .slice(0, 4000);
}

async function handleMailCommand(
  chatId: number,
  text: string,
): Promise<void> {
  const rest = text.replace(/^\/mail(@\w+)?\s*/, '').trim();
  if (!rest) {
    await sendMessage({
      chatId,
      text: 'Kullanım: /mail <email> <talimat>\nÖrnek: /mail ahmet@x.com yarın 14:00 toplantı iptal yaz',
    });
    return;
  }

  const parsed = parseMailCommand(rest);
  if (!parsed) {
    await sendMessage({
      chatId,
      text: 'Geçerli email bulunamadı veya talimat boş. Örnek: /mail ahmet@x.com yarın toplantı iptal',
    });
    return;
  }

  await cancelActiveDrafts(chatId);
  await sendMessage({ chatId, text: '✏️ Mail taslağı yazılıyor…' });

  try {
    const brandKit = await getBrandKit();
    const drafted = await generateMailDraft({
      recipient: parsed.recipient,
      instruction: parsed.instruction,
      brandKit,
    });

    const draft = await createDraft({
      to_email: parsed.recipient,
      subject: drafted.subject,
      body: drafted.body,
      instruction: parsed.instruction,
      telegram_chat_id: chatId,
      status: 'drafting',
    });

    const sent = await sendMessage({
      chatId,
      text: formatMailPreview(draft),
      replyMarkup: mailPreviewKeyboard(draft.id),
    });
    await updateDraft(draft.id, {
      telegram_preview_msg_id: sent.message_id,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function refreshMailPreview(
  chatId: number,
  draft: MailDraft,
): Promise<void> {
  if (!draft.telegram_preview_msg_id) {
    await sendMessage({
      chatId,
      text: formatMailPreview(draft),
      replyMarkup: mailPreviewKeyboard(draft.id),
    });
    return;
  }
  try {
    await editMessageText({
      chatId,
      messageId: draft.telegram_preview_msg_id,
      text: formatMailPreview(draft),
      replyMarkup: mailPreviewKeyboard(draft.id),
    });
  } catch {
    // Edit may fail if message is too old — fall back to a fresh send.
    await sendMessage({
      chatId,
      text: formatMailPreview(draft),
      replyMarkup: mailPreviewKeyboard(draft.id),
    });
  }
}

async function handleMailSend(
  chatId: number,
  messageId: number,
  draftId: string,
): Promise<void> {
  const draft = await getDraft(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: `❓ Taslak bulunamadı: ${draftId}` });
    return;
  }
  if (draft.status === 'sent') {
    await sendMessage({ chatId, text: 'Bu mail zaten gönderilmiş.' });
    return;
  }
  if (!draft.subject || !draft.body) {
    await sendMessage({
      chatId,
      text: '❌ Taslakta konu/metin eksik. /mail ile yeniden başlat.',
    });
    return;
  }

  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: '📤 Mail gönderiliyor…' });

  try {
    const result = await sendMail({
      to: draft.to_email,
      subject: draft.subject,
      body: draft.body,
      attachments: draft.attachments,
      ...(draft.in_reply_to_message_id
        ? { inReplyTo: draft.in_reply_to_message_id }
        : {}),
      ...(draft.mail_references ? { references: draft.mail_references } : {}),
    });
    await markSent(draft.id);
    await sendMessage({
      chatId,
      text: [
        '✅ Gönderildi.',
        `Kime: ${draft.to_email}`,
        `Konu: ${draft.subject}`,
        `Message-ID: ${result.messageId}`,
      ].join('\n'),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateDraft(draft.id, { error: msg.slice(0, 1000) });
    await notifyError(chatId, err);
  }
}

async function handleMailRegenPrompt(
  chatId: number,
  draftId: string,
): Promise<void> {
  const draft = await getDraft(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: `❓ Taslak bulunamadı: ${draftId}` });
    return;
  }
  await updateDraft(draft.id, { status: 'awaiting_regen' });
  await sendMessage({
    chatId,
    text: 'Nasıl olsun? (örn. "daha samimi yaz", "İngilizce yaz", "fiyat detayı ekle")',
  });
}

async function applyMailRegen(
  chatId: number,
  draft: MailDraft,
  refinement: string,
): Promise<void> {
  await sendMessage({ chatId, text: '✏️ Yeniden yazılıyor…' });
  try {
    const brandKit = await getBrandKit();
    // If this draft was created from an inbox reply, the user's plain-text
    // turn is the FIRST instruction (none yet recorded). Otherwise it's a
    // refinement on top of an existing draft.
    const isFirstReply = draft.instruction.trim().length === 0;
    const linkedInbox = isFirstReply
      ? await findInboxForDraft(draft.id)
      : null;

    const drafted = await generateMailDraft({
      recipient: draft.to_email,
      instruction: isFirstReply ? refinement : draft.instruction,
      brandKit,
      previousSubject: isFirstReply ? undefined : draft.subject ?? undefined,
      previousBody: isFirstReply ? undefined : draft.body ?? undefined,
      refinement: isFirstReply ? undefined : refinement,
      originalMail: linkedInbox
        ? { subject: linkedInbox.subject, body: linkedInbox.body_preview }
        : undefined,
    });
    const updated = await updateDraft(draft.id, {
      subject: drafted.subject,
      body: drafted.body,
      status: 'drafting',
      ...(isFirstReply ? { instruction: refinement } : {}),
    });
    await refreshMailPreview(chatId, updated);
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleMailAttachPrompt(
  chatId: number,
  draftId: string,
): Promise<void> {
  const draft = await getDraft(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: `❓ Taslak bulunamadı: ${draftId}` });
    return;
  }
  await updateDraft(draft.id, { status: 'awaiting_attachment' });
  await sendMessage({
    chatId,
    text: 'Dosyayı gönder (max 20 MB). Birden fazla dosya için her birini tek tek gönder; sonra "Gönder" butonuna bas.',
  });
}

async function applyMailAttachment(
  chatId: number,
  draft: MailDraft,
  file: { fileId: string; filename: string; mime: string; sizeBytes?: number },
): Promise<void> {
  if (file.sizeBytes && file.sizeBytes > MAX_ATTACHMENT_BYTES) {
    await sendMessage({
      chatId,
      text: '❌ Dosya 20 MB sınırını aşıyor. Daha küçük bir dosya gönder.',
    });
    return;
  }

  try {
    const info = await getFile(file.fileId);
    const buffer = await downloadFile(info.file_path);
    const updated = await addAttachment(draft.id, {
      filename: file.filename,
      mime: file.mime,
      base64: buffer.toString('base64'),
    });
    await refreshMailPreview(chatId, updated);
  } catch (err) {
    await notifyError(chatId, err);
  }
}

// Linking from inbox to draft is one-to-one; we look up the linked inbox
// row when generating/sending so the AI sees the original mail and the
// outbound headers carry In-Reply-To / References.
async function findInboxForDraft(
  draftId: string,
): Promise<MailInbox | null> {
  const { db } = await import('@/lib/db');
  const { mailInbox } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const rows = await db
    .select()
    .from(mailInbox)
    .where(eq(mailInbox.replied_draft_id, draftId))
    .limit(1);
  return rows[0] ?? null;
}

async function handleMailReply(
  chatId: number,
  inboxId: string,
): Promise<void> {
  const inbox = await getInboxById(inboxId);
  if (!inbox) {
    await sendMessage({ chatId, text: `❓ Mail bulunamadı: ${inboxId}` });
    return;
  }
  await cancelActiveDrafts(chatId);
  const subject = inbox.subject ?? '';
  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const draft = await createDraft({
    to_email: inbox.from_email,
    subject: replySubject,
    body: null,
    instruction: '',
    telegram_chat_id: chatId,
    status: 'awaiting_regen',
    in_reply_to_message_id: inbox.message_id ?? null,
    mail_references: inbox.message_id ?? null,
  });
  await setRepliedDraftId(inbox.id, draft.id);
  await sendMessage({
    chatId,
    text: [
      `💬 Cevap: ${inbox.from_name ?? inbox.from_email}`,
      `Konu: ${replySubject}`,
      '',
      'Bu maile ne yazayım? (1-2 cümle yön ver, AI taslak hazırlasın)',
    ].join('\n'),
  });
}

async function handleMailCancel(
  chatId: number,
  messageId: number,
  draftId: string,
): Promise<void> {
  await markCancelled(draftId);
  try {
    await editMessageText({
      chatId,
      messageId,
      text: '✗ Mail taslağı iptal edildi.',
    });
  } catch {
    await sendMessage({ chatId, text: '✗ Mail taslağı iptal edildi.' });
  }
}

// ───── /fatura invoice flow ─────

const FOOTER_PRESETS: Record<string, string> = {
  p1: 'Zahlbar innerhalb von 7 Tagen ohne Abzug.',
  p2: 'Anzahlung 50% für Design, Restbetrag nach Fertigstellung fällig.',
};

function invoiceToData(inv: Invoice): InvoiceData {
  if (!inv.recipient) {
    throw new Error('Invoice has no recipient — cannot render');
  }
  return {
    number: inv.number,
    type: inv.type,
    date: inv.date,
    recipient: {
      company: inv.recipient.company,
      name: inv.recipient.name,
      street: inv.recipient.street,
      zipCity: inv.recipient.zipCity,
    },
    items: inv.items,
    totalCents: inv.total_cents,
    footerNote: inv.footer_note,
  };
}

function summarizeInvoice(inv: Invoice): string {
  const recipient = inv.recipient
    ? [
        inv.recipient.company,
        inv.recipient.name,
        inv.recipient.street,
        inv.recipient.zipCity,
      ]
        .filter((s): s is string => Boolean(s))
        .join(', ')
    : '(yok)';
  const lines = inv.items
    .map(
      (it) =>
        `  • ${it.description} — ${it.quantity}× ${formatCents(it.unitPriceCents)}€ = ${formatCents(it.unitPriceCents * it.quantity)}€`,
    )
    .join('\n');
  return [
    `🧾 ${INVOICE_TYPE_LABEL[inv.type]} #${inv.number}`,
    `📅 ${inv.date}`,
    `👤 ${recipient}`,
    '',
    'Kalemler:',
    lines || '  (yok)',
    '',
    `💶 Toplam: ${formatCents(inv.total_cents)}€`,
    inv.footer_note ? `\n📝 ${inv.footer_note}` : '',
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

async function handleFaturaCommand(chatId: number): Promise<void> {
  await cancelActiveInvoiceDrafts(chatId);
  await createInvoiceDraft({ chatId });
  await sendMessage({
    chatId,
    text: '🧾 Yeni fatura — tipini seç:',
    replyMarkup: invoiceTypeKeyboard(),
  });
}

async function handleInvoiceTypeChoice(
  chatId: number,
  messageId: number,
  type: InvoiceTypeUnion,
): Promise<void> {
  const draft = await getActiveInvoiceDraft(chatId);
  if (!draft) {
    await sendMessage({ chatId, text: '❓ Aktif fatura taslağı yok. /fatura yaz.' });
    return;
  }

  if (type === 'schlussrechnung') {
    await updateInvoiceDraft(draft.id, {
      type,
      current_step: 'anzahlung_choice',
    });
    const prompt = `🧾 ${INVOICE_TYPE_LABEL[type]} seçildi.\n\nÖnceki Teilrechnung'dan indirilecek bir tutar var mı?`;
    try {
      await editMessageText({
        chatId,
        messageId,
        text: prompt,
        replyMarkup: schlussrechnungAnzahlungKeyboard(draft.id),
      });
    } catch {
      await sendMessage({
        chatId,
        text: prompt,
        replyMarkup: schlussrechnungAnzahlungKeyboard(draft.id),
      });
    }
    return;
  }

  await updateInvoiceDraft(draft.id, {
    type,
    current_step: 'recipient_name',
  });
  try {
    await editMessageText({
      chatId,
      messageId,
      text: `🧾 ${INVOICE_TYPE_LABEL[type]} seçildi.\n\nMüşteri (sadece kişi adı yaz, şirket varsa "Şirket / Kişi Adı" formatında):`,
    });
  } catch {
    await sendMessage({
      chatId,
      text: 'Müşteri (sadece kişi adı, şirket varsa "Şirket / Kişi Adı" formatında):',
    });
  }
}

async function handleAnzahlungAdd(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'anzahlung_amount' });
  await sendMessage({
    chatId,
    text: 'Önceki ödeme tutarı (€)? Sadece pozitif sayı yaz, otomatik düşülecek:\nÖrnek: 350 ya da 199,90',
  });
}

async function handleAnzahlungSkip(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'recipient_name' });
  await sendMessage({
    chatId,
    text: 'Müşteri (sadece kişi adı, şirket varsa "Şirket / Kişi Adı" formatında):',
  });
}

function parseGermanDate(text: string): string | null {
  const t = text.trim();
  const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(t);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${dd}.${mm}.${m[3]}`;
}

function parseRecipientNameLine(
  text: string,
): { company: string | null; name: string } {
  if (text.includes('/')) {
    const idx = text.indexOf('/');
    const company = text.slice(0, idx).trim();
    const name = text.slice(idx + 1).trim();
    return { company: company || null, name: name || company };
  }
  return { company: null, name: text.trim() };
}

function parseAddressLine(
  text: string,
): { street: string; zipCity: string } | null {
  const lastComma = text.lastIndexOf(',');
  if (lastComma === -1) return null;
  const street = text.slice(0, lastComma).trim();
  const zipCity = text.slice(lastComma + 1).trim();
  if (!street || !zipCity) return null;
  return { street, zipCity };
}

function parsePriceCents(s: string): number | null {
  const cleaned = s.replace(/\s+/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function parseQuantity(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (t === '' || t === 'atla' || t === 'skip') return 1;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

async function moveToFooterStep(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'footer' });
  await sendMessage({
    chatId,
    text: 'Alt not (sayfa ortasında çıkar) — bir tane seç ya da yaz:',
    replyMarkup: invoiceFooterKeyboard(draftId),
  });
}

async function moveToNumberStep(
  chatId: number,
  draftId: string,
): Promise<void> {
  const auto = await nextInvoiceNumber();
  const draft = await getActiveInvoiceDraft(chatId);
  if (!draft) return;
  const merged = {
    ...(draft.pending_item ?? {}),
    suggestedNumber: auto,
  };
  await updateInvoiceDraft(draftId, {
    current_step: 'number',
    pending_item: merged,
  });
  await sendMessage({
    chatId,
    text: `Fatura no önerisi: ${auto}\n(önceki son fatura takip edilerek atandı)`,
    replyMarkup: invoiceNumberKeyboard(draftId, auto),
  });
}

async function buildAndPreviewInvoice(
  chatId: number,
  draft: Invoice,
): Promise<void> {
  await sendMessage({ chatId, text: '📄 PDF oluşturuluyor…' });
  try {
    const data = invoiceToData(draft);
    const pdf = await renderInvoicePdf(data);
    const sent = await sendDocument({
      chatId,
      document: pdf,
      filename: `Rechnung_${draft.number}.pdf`,
      mime: 'application/pdf',
      caption: summarizeInvoice(draft).slice(0, 1024),
    });
    await sendMessage({
      chatId,
      text: 'Şimdi ne yapayım?',
      replyMarkup: invoicePreviewKeyboard(draft.id),
    });
    await markInvoicePreview(draft.id);
    await updateInvoiceDraft(draft.id, {
      telegram_preview_msg_id: sent.message_id,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleInvoiceText(
  chatId: number,
  draft: Invoice,
  text: string,
): Promise<boolean> {
  const step = draft.current_step;

  if (step === 'anzahlung_amount') {
    const cents = parsePriceCents(text);
    if (cents === null || cents === 0) {
      await sendMessage({
        chatId,
        text: '⚠️ Geçerli bir tutar yaz (pozitif sayı). Örnek: 350 veya 199,90',
      });
      return true;
    }
    await setInvoicePendingItem(draft.id, { unitPriceCents: -cents });
    await updateInvoiceDraft(draft.id, { current_step: 'anzahlung_date' });
    await sendMessage({
      chatId,
      text: 'Önceki Teilrechnung tarihi? Format: DD.MM.YYYY\nÖrnek: 20.04.2026',
    });
    return true;
  }

  if (step === 'anzahlung_date') {
    const date = parseGermanDate(text);
    if (!date) {
      await sendMessage({
        chatId,
        text: '⚠️ Tarih formatı yanlış. Örnek: 20.04.2026',
      });
      return true;
    }
    const cents = draft.pending_item?.unitPriceCents;
    if (typeof cents !== 'number') {
      await sendMessage({
        chatId,
        text: '🔴 İç hata: ödeme tutarı kaybolmuş. /fatura ile yeniden başla.',
      });
      return true;
    }
    await appendInvoiceItem(draft.id, {
      description: `abzüglich bereits geleisteter Anzahlung vom ${date}`,
      unitPriceCents: cents,
      quantity: 1,
    });
    await setInvoicePendingItem(draft.id, {});
    await updateInvoiceDraft(draft.id, { current_step: 'recipient_name' });
    await sendMessage({
      chatId,
      text: '✅ Anzahlung indirimi eklendi.\n\nMüşteri (sadece kişi adı, şirket varsa "Şirket / Kişi Adı" formatında):',
    });
    return true;
  }

  if (step === 'recipient_name') {
    const parsed = parseRecipientNameLine(text);
    if (!parsed.name) {
      await sendMessage({ chatId, text: 'Geçerli bir isim yaz.' });
      return true;
    }
    await setInvoiceRecipient(draft.id, {
      company: parsed.company,
      name: parsed.name,
      street: '',
      zipCity: '',
    });
    await updateInvoiceDraft(draft.id, { current_step: 'recipient_address' });
    await sendMessage({
      chatId,
      text: 'Adres? Format: Sokak No, PLZ Şehir\nÖrnek: Hauptstraße 5, 60311 Frankfurt',
    });
    return true;
  }

  if (step === 'recipient_address') {
    const parsed = parseAddressLine(text);
    if (!parsed) {
      await sendMessage({
        chatId,
        text: '⚠️ Adres formatı yanlış. Bir virgül ile sokak ve PLZ Şehir\'i ayır:\nHauptstraße 5, 60311 Frankfurt',
      });
      return true;
    }
    if (!draft.recipient) {
      await sendMessage({
        chatId,
        text: '🔴 İç hata: alıcı kaydı yok. /fatura ile yeniden başla.',
      });
      return true;
    }
    await setInvoiceRecipient(draft.id, {
      company: draft.recipient.company,
      name: draft.recipient.name,
      street: parsed.street,
      zipCity: parsed.zipCity,
    });
    await updateInvoiceDraft(draft.id, {
      current_step: 'item_description',
      date: draft.date || todayDDMMYYYY(),
    });
    await sendMessage({ chatId, text: 'Hizmet/ürün açıklaması?' });
    return true;
  }

  if (step === 'item_description') {
    const desc = text.trim();
    if (!desc) {
      await sendMessage({ chatId, text: 'Boş açıklama olmaz.' });
      return true;
    }
    await setInvoicePendingItem(draft.id, { description: desc });
    await updateInvoiceDraft(draft.id, { current_step: 'item_price' });
    await sendMessage({
      chatId,
      text: 'Tutar (€)? Sadece sayı yaz (virgül veya nokta olabilir):\nÖrnek: 300 ya da 199,90',
    });
    return true;
  }

  if (step === 'item_price') {
    const cents = parsePriceCents(text);
    if (cents === null) {
      await sendMessage({
        chatId,
        text: '⚠️ Geçerli bir tutar yaz. Örnek: 300 veya 199,90',
      });
      return true;
    }
    const merged = {
      ...(draft.pending_item ?? {}),
      unitPriceCents: cents,
    };
    await setInvoicePendingItem(draft.id, merged);
    await updateInvoiceDraft(draft.id, { current_step: 'item_quantity' });
    await sendMessage({
      chatId,
      text: 'Adet (varsayılan 1)? Sayı yaz veya "atla":',
    });
    return true;
  }

  if (step === 'item_quantity') {
    const qty = parseQuantity(text);
    if (qty === null) {
      await sendMessage({
        chatId,
        text: '⚠️ 1 ya da daha büyük bir sayı yaz. "atla" yazabilirsin.',
      });
      return true;
    }
    const pending = draft.pending_item;
    if (
      !pending?.description ||
      typeof pending.unitPriceCents !== 'number'
    ) {
      await sendMessage({
        chatId,
        text: '🔴 İç hata: kalem bilgileri eksik. /fatura ile yeniden başla.',
      });
      return true;
    }
    await appendInvoiceItem(draft.id, {
      description: pending.description,
      unitPriceCents: pending.unitPriceCents,
      quantity: qty,
    });
    await updateInvoiceDraft(draft.id, { current_step: 'item_more' });
    await sendMessage({
      chatId,
      text: '✅ Kalem eklendi. Başka kalem var mı?',
      replyMarkup: invoiceItemMoreKeyboard(draft.id),
    });
    return true;
  }

  if (step === 'footer_manual') {
    const note = text.trim();
    await updateInvoiceDraft(draft.id, {
      footer_note: note || null,
    });
    await moveToNumberStep(chatId, draft.id);
    return true;
  }

  if (step === 'number_manual') {
    const trimmed = text.trim();
    const parsed = parseInvoiceNumber(trimmed);
    if (!parsed) {
      await sendMessage({
        chatId,
        text: '⚠️ Format: 2026-NNN (4 hane yıl, 3 hane sayı)\nÖrnek: 2026-051',
      });
      return true;
    }
    const existing = await getInvoiceByNumber(trimmed);
    if (existing && existing.id !== draft.id) {
      await sendMessage({
        chatId,
        text: `⚠️ ${trimmed} numaralı fatura zaten var. Başka bir numara yaz.`,
      });
      return true;
    }
    const finalDraft = await updateInvoiceDraft(draft.id, {
      number: trimmed,
      current_step: 'confirm',
    });
    await buildAndPreviewInvoice(chatId, finalDraft);
    return true;
  }

  return false;
}

async function handleInvoiceItemMore(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'item_description' });
  await sendMessage({ chatId, text: 'Yeni kalemin açıklaması?' });
}

async function handleInvoiceNoMoreItems(
  chatId: number,
  draftId: string,
): Promise<void> {
  await moveToFooterStep(chatId, draftId);
}

async function handleInvoiceFooterPreset(
  chatId: number,
  draftId: string,
  key: string,
): Promise<void> {
  const note = FOOTER_PRESETS[key] ?? null;
  await updateInvoiceDraft(draftId, { footer_note: note });
  await moveToNumberStep(chatId, draftId);
}

async function handleInvoiceFooterManual(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'footer_manual' });
  await sendMessage({ chatId, text: 'Notu yaz (tek satırlık serbest metin):' });
}

async function handleInvoiceFooterSkip(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { footer_note: null });
  await moveToNumberStep(chatId, draftId);
}

async function handleInvoiceNumberAuto(
  chatId: number,
  draftId: string,
): Promise<void> {
  const draft = await getInvoice(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: `❓ Taslak bulunamadı: ${draftId}` });
    return;
  }
  const auto = draft.pending_item?.suggestedNumber ?? (await nextInvoiceNumber());
  const existing = await getInvoiceByNumber(auto);
  const finalNumber =
    existing && existing.id !== draft.id ? await nextInvoiceNumber() : auto;
  const updated = await updateInvoiceDraft(draftId, {
    number: finalNumber,
    current_step: 'confirm',
  });
  await buildAndPreviewInvoice(chatId, updated);
}

async function handleInvoiceNumberManual(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'number_manual' });
  await sendMessage({
    chatId,
    text: 'Hangi numara olsun? Format: 2026-NNN',
  });
}

async function handleInvoiceCancel(chatId: number): Promise<void> {
  const cancelled = await cancelActiveInvoiceDrafts(chatId);
  await sendMessage({
    chatId,
    text:
      cancelled > 0
        ? `✗ ${cancelled} fatura taslağı iptal edildi.`
        : 'Aktif fatura taslağı yoktu.',
  });
}

async function handleInvoiceDelete(
  chatId: number,
  invoiceId: string,
): Promise<void> {
  const inv = await getInvoice(invoiceId);
  if (!inv) {
    await sendMessage({ chatId, text: `❓ Fatura bulunamadı: ${invoiceId}` });
    return;
  }
  await markInvoiceDeleted(invoiceId);
  await sendMessage({
    chatId,
    text: `🗑 ${inv.number} silindi.\n(Numara tekrar kullanılmaz; bir sonraki fatura ${(parseInvoiceNumber(inv.number)?.seq ?? 0) + 1}'de olacak.)`,
  });
}

async function handleInvoiceSave(
  chatId: number,
  invoiceId: string,
): Promise<void> {
  const inv = await getInvoice(invoiceId);
  if (!inv) {
    await sendMessage({ chatId, text: `❓ Fatura bulunamadı: ${invoiceId}` });
    return;
  }
  await markInvoiceSent(invoiceId);
  await sendMessage({
    chatId,
    text: `💾 ${inv.number} kaydedildi. Mail atılmadı.`,
  });
}

async function handleInvoiceRestart(chatId: number): Promise<void> {
  await cancelActiveInvoiceDrafts(chatId);
  await handleFaturaCommand(chatId);
}

async function handleInvoiceSendMail(
  chatId: number,
  invoiceId: string,
): Promise<void> {
  const inv = await getInvoice(invoiceId);
  if (!inv) {
    await sendMessage({ chatId, text: `❓ Fatura bulunamadı: ${invoiceId}` });
    return;
  }
  if (!inv.recipient) {
    await sendMessage({
      chatId,
      text: '🔴 Faturada alıcı yok — mail atılamaz.',
    });
    return;
  }

  await sendMessage({
    chatId,
    text: '📧 Mail hazırlanıyor… (PDF eklenecek, AI Almanca metin yazıyor)',
  });

  try {
    const brandKit = await getBrandKit();
    const data = invoiceToData(inv);
    const [pdfBuf, cover] = await Promise.all([
      renderInvoicePdf(data),
      generateInvoiceCoverLetter(data, brandKit),
    ]);

    // Reuse the active mail-draft pipeline (preview + buttons).
    await cancelActiveDrafts(chatId);

    // Pre-fill the mail draft with the cover letter; recipient prompt comes
    // first because we don't know the customer's email address yet.
    await sendMessage({
      chatId,
      text: 'Müşterinin email adresini yaz (sadece adres):',
    });
    // Stash the prepared payload in a transient draft via instruction
    // marker so that the next plain-text turn (handled below) can finalize.
    // Attachments inline at create time — addAttachment would override
    // status back to 'drafting' and break the email-prompt intercept.
    await createDraft({
      to_email: 'pending@invoice.local',
      subject: cover.subject,
      body: cover.body,
      instruction: `__INVOICE_PENDING__:${inv.id}`,
      telegram_chat_id: chatId,
      status: 'awaiting_regen',
      attachments: [
        {
          filename: `Rechnung_${inv.number}.pdf`,
          mime: 'application/pdf',
          base64: pdfBuf.toString('base64'),
        },
      ],
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

// ───── Haftalik Plan Handlers ─────

async function handleWeeklyPlanCommand(chatId: number): Promise<void> {
  await sendMessage({ chatId, text: '📅 Haftalık plan oluşturuluyor… (15-30 saniye)' });
  try {
    const { plan, slots } = await generateWeeklyPlan(chatId);
    const text = formatPlanForTelegram(plan, slots);
    const sent = await sendMessage({
      chatId,
      text,
      replyMarkup: planOverviewKeyboard(plan.id, plan.status === 'approved'),
    });
    await updatePlan(plan.id, { telegram_message_id: sent.message_id });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handlePlanStatusCommand(chatId: number): Promise<void> {
  const { week, year } = getCurrentWeek();
  const plan = await getPlanByWeek(week, year);
  if (!plan) {
    await sendMessage({ chatId, text: `KW${week}/${year} için henüz plan yok. /haftalik-plan yaz.` });
    return;
  }
  const slots = await getSlotsByPlan(plan.id);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(plan.id, plan.status === 'approved') });
}

async function handlePlanApproveAll(chatId: number, messageId: number, planId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }

  const slots = await getSlotsByPlan(planId);
  const topicsToGenerate = slots.filter((s) => s.topic);

  if (topicsToGenerate.length === 0) {
    await sendMessage({ chatId, text: '⚠️ Planda konusu olan slot yok.' });
    return;
  }

  await sendMessage({
    chatId,
    text: [
      `📤 ${topicsToGenerate.length} post üretiliyor.`,
      'Her biri hazır oldukça görseli buraya gelecek.',
      'Hata olursa burada bildirilecek.',
      '',
      `Plan: KW${plan.calendar_week}/${plan.year}`,
    ].join('\n'),
  });

  // Process all slots synchronously via batch endpoint.
  const baseUrl = process.env.APP_URL ?? 'https://admin.fly-froth.com';
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    await sendMessage({ chatId, text: '🔴 İç hata: CRON_SECRET eksik.' });
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/api/generate-plan-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ planId, chatId }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => 'unknown');
      console.error(`[plan] Batch endpoint returned ${res.status}: ${errBody}`);
    }
  } catch (err) {
    console.error('[plan] Batch dispatch failed:', err);
    await sendMessage({
      chatId,
      text: `🔴 Plan işleme başlatılamadı: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

async function handlePlanCancel(chatId: number, messageId: number, planId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined }).catch(() => {});
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }
  if (plan.status !== 'approved') {
    await sendMessage({ chatId, text: `Plan durumu: ${plan.status}. Sadece onaylı planlar iptal edilebilir.` });
    return;
  }

  const slots = await getSlotsByPlan(planId);
  let deleted = 0;
  for (const s of slots) {
    if (s.post_id) {
      try {
        await deletePost(s.post_id);
        deleted++;
      } catch (err) {
        await sendMessage({ chatId, text: `Post silme hatası (${s.post_id}): ${err instanceof Error ? err.message : String(err)}` });
      }
    }
    await updateSlot(s.id, { post_id: null, status: 'pending' });
  }
  await updatePlan(planId, { status: 'draft', approved_at: null });

  await sendMessage({
    chatId,
    text: [
      `↩️ KW${plan.calendar_week} planı iptal edildi.`,
      `${deleted} post silindi, ${slots.length} slot beklemede.`,
      'Yeniden /haftalik-plan yazarak yeni plan oluşturabilirsin.',
    ].join('\n'),
  });
}

async function handlePlanRegen(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }
  const oldSlots = await getSlotsByPlan(planId);
  for (const s of oldSlots) await deleteSlot(s.id);
  await sendMessage({ chatId, text: '🔄 Plan yeniden oluşturuluyor…' });
  try {
    const { slots } = await generateWeeklyPlan(chatId);
    await updatePlan(planId, { status: 'draft' });
    const text = formatPlanForTelegram(plan, slots);
    const sent = await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(planId, false) });
    await updatePlan(planId, { telegram_message_id: sent.message_id });
  } catch (err) { await notifyError(chatId, err); }
}

async function handlePlanDiscard(chatId: number, messageId: number, planId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined }).catch(() => {});
  const slots = await getSlotsByPlan(planId);
  let deletedPosts = 0;
  for (const s of slots) {
    if (s.post_id) {
      try { await deletePost(s.post_id); deletedPosts++; } catch {}
    }
    await deleteSlot(s.id);
  }
  // Actually delete the plan from DB so a new one can be created
  await updatePlan(planId, { status: 'draft', approved_at: null });
  await sendMessage({
    chatId,
    text: `🗑 Plan silindi. ${slots.length} slot ve ${deletedPosts} post kaldırıldı. /haftalik-plan ile yenisini oluşturabilirsin.`,
  });
}

async function handlePlanView(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }
  const slots = await getSlotsByPlan(planId);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(plan.id, plan.status === 'approved') });
}

async function handlePlanEditPrompt(chatId: number, planId: string): Promise<void> {
  const slots = await getSlotsByPlan(planId);
  if (!slots.length) { await sendMessage({ chatId, text: 'Planda slot yok.' }); return; }
  const lines = slots.map((s, i) => {
    const day = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][s.day_of_week] ?? '??';
    return `${i + 1}. ${day} ${s.time_slot} [${s.pillar}] ${s.topic ?? '(leer)'}`;
  });
  await sendMessage({
    chatId,
    text: ['✏️ Slot seçmek için numarasını yaz (örn. "3"), veya:', '', ...lines].join('\n'),
  });
}

async function handleSlotApprove(chatId: number, messageId: number, slotId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const slot = await getSlot(slotId);
  if (!slot || !slot.topic) { await sendMessage({ chatId, text: 'Slot bulunamadı veya konu yok.' }); return; }
  await sendMessage({ chatId, text: '🎨 Post üretiliyor…' });
  try {
    const post = await generatePost({
      topic: slot.topic,
      telegramChatId: String(chatId),
      channel: slot.channel === 'reel' ? 'ig_story' : 'post',
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}\n\n${(post.hashtags ?? []).map((h: string) => `#${h}`).join(' ')}`.slice(0, 1024),
    });
    await sendMessage({ chatId, text: '✅ Slot onaylandı ve post hazır.' });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleSlotRegenTopic(chatId: number, slotId: string): Promise<void> {
  await sendMessage({ chatId, text: '✏️ Yeni konuyu mesaj olarak yaz. Kaydedilecek.' });
  // Topic editing through text input is handled by the state machine when a slot is selected
}

async function handleSlotDelete(chatId: number, messageId: number, slotId: string): Promise<void> {
  const slot = await getSlot(slotId);
  await deleteSlot(slotId);
  await sendMessage({ chatId, text: `🗑 Slot ${slot?.topic ?? slotId} silindi.` });
}

async function handleSlotGenerate(chatId: number, messageId: number, slotId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const slot = await getSlot(slotId);
  if (!slot || !slot.topic) return;
  await sendMessage({ chatId, text: '🎨 Post üretiliyor…' });
  try {
    const post = await generatePost({
      topic: slot.topic,
      telegramChatId: String(chatId),
      channel: slot.channel === 'reel' ? 'ig_story' : 'post',
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}`.slice(0, 1024),
    });
  } catch (err) { await notifyError(chatId, err); }
}

// ───── Email Marketing Handlers ─────

function emailListIds(): number[] {
  const raw = process.env.BREVO_LIST_IDS;
  if (!raw) return [];
  return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
}

async function handleEmailDigestCommand(chatId: number): Promise<void> {
  const listIds = emailListIds();
  if (listIds.length === 0) {
    await sendMessage({ chatId, text: '⚠️ BREVO_LIST_IDS env eksik. .env.local\'a ekleyin.' });
    return;
  }

  const { week, year } = getCurrentWeek();
  const plan = await getPlanByWeek(week, year);
  if (!plan) {
    await sendMessage({ chatId, text: `KW${week}/${year} için plan yok. Önce /haftalik-plan yaz.` });
    return;
  }

  const slots = await getSlotsByPlan(plan.id);
  if (slots.length === 0) {
    await sendMessage({ chatId, text: 'Planda slot yok.' });
    return;
  }

  // Build preview
  const pillarCounts: Record<string, number> = {};
  for (const s of slots) {
    pillarCounts[s.pillar] = (pillarCounts[s.pillar] ?? 0) + 1;
  }

  const portfolioItems = slotsToPortfolioItems(slots);
  const subject = `Neue Design-Projekte | KW${week} — Fly & Froth Studio Update`;

  let listInfo = '';
  try {
    const lists = await getLists();
    const relevant = lists.filter((l) => listIds.includes(l.id));
    if (relevant.length > 0) {
      listInfo = relevant.map((l) => `#${l.id} (${l.totalSubscribers} kişi)`).join(', ');
    }
  } catch { listInfo = listIds.join(', '); }

  const pillarEmoji: Record<string, string> = {
    vitrine: '🖼', prozess: '🎬', insight: '📊', lokal: '📍', reel: '🎥',
  };

  const preview = [
    `📧 **KW${week} Email Bülteni — Önizleme**`,
    '',
    `📌 Konu: ${subject}`,
    '',
    `📋 Hedef Liste: ${listInfo || '—'}`,
    '',
    'İçerik:',
    ...Object.entries(pillarCounts).map(([k, v]) => `  ${pillarEmoji[k] ?? '📌'} ${v}× ${k}`),
    '',
    `🖼 Portfolyo: ${portfolioItems.length} proje`,
    '',
    '📧 *Bana test gönder* = info@fly-froth.com adresine önizleme',
    '📋 *Listeye gönder* = tüm listeye kampanya başlat',
  ].join('\n');

  await sendMessage({
    chatId,
    text: preview,
    replyMarkup: emailDigestKeyboard(plan.id),
  });
}

async function handleEmailListsCommand(chatId: number): Promise<void> {
  try {
    const lists = await getLists();
    if (lists.length === 0) {
      await sendMessage({ chatId, text: 'Brevo\'da henüz liste yok. Brevo panelinde bir liste oluşturup ID\'sini BREVO_LIST_IDS env\'ye ekle.' });
      return;
    }
    const lines = lists.map((l) => `• #${l.id}: ${l.name} (${l.totalSubscribers} kişi)`);
    await sendMessage({ chatId, text: ['📋 Brevo Listeleri:', ...lines].join('\n') });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleEmailOutreachCommand(chatId: number, city: string): Promise<void> {
  const validCities = [
    'Karben', 'Frankfurt', 'Bad Vilbel', 'Friedberg', 'Hanau', 'Bad Homburg',
    'Oberursel', 'Kronberg', 'Königstein', 'Bad Soden', 'Eschborn', 'Hofheim',
    'Bad Nauheim', 'Butzbach', 'Niddatal', 'Rosbach', 'Wöllstadt', 'Nidderau', 'Bruchköbel',
  ];
  const match = validCities.find((c) => c.toLowerCase() === city.toLowerCase());
  if (!match) {
    await sendMessage({
      chatId,
      text: `❓ "${city}" Rhein-Main listesinde yok.\nGeçerli: ${validCities.join(', ')}`,
    });
    return;
  }

  await sendMessage({
    chatId,
    text: [
      `📧 ${match} için lokal outreach emaili hazırlanıyor…`,
      '',
      'Bu özellik şu anda test aşamasında.',
      'Göndermek için alıcı email adreslerini yaz (virgülle):',
      'Örnek: ahmet@firma1.com, mehmet@firma2.de',
      '',
      'Veya BREVO_LIST_IDS ile otomatik listeye gönderilecek.',
    ].join('\n'),
  });

  // Note: full automation requires contact list with local businesses.
  // For now, the user can manually follow up.
}

async function handleEmailReactivateCommand(
  chatId: number,
  email: string,
  name: string,
  project: string,
): Promise<void> {
  if (!email.includes('@')) {
    await sendMessage({ chatId, text: '⚠️ Geçerli bir email adresi yaz.' });
    return;
  }

  await sendMessage({ chatId, text: `📧 ${name} için reaktivasyon maili gönderiliyor…` });

  try {
    await sendReactivation(email, name, project);
    await sendMessage({
      chatId,
      text: `✅ Reaktivasyon maili ${email} adresine gönderildi.\nKonu: ${name}, lass uns wieder zusammenarbeiten`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

// ───── Email Callback Handlers ─────

async function handleEmailDigestTest(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }

  const slots = await getSlotsByPlan(plan.id);
  if (slots.length === 0) { await sendMessage({ chatId, text: 'Planda slot yok.' }); return; }

  const week = plan.calendar_week;
  const year = plan.year;
  const testEmail = process.env.EMAIL_FROM || 'info@fly-froth.com';

  await sendMessage({ chatId, text: `📧 Test maili ${testEmail} adresine gönderiliyor…` });

  try {
    // Digest
    const digestItems: DigestItem[] = slots.map((s) => ({
      topic: s.topic ?? '',
      pillar: s.pillar,
      channel: s.channel,
    }));
    const digestHtml = weeklyDigest(digestItems, week, year);
    await sendEmail({
      to: [{ email: testEmail }],
      subject: `Dein Weekly Digest | KW${week} — Fly & Froth`,
      htmlContent: digestHtml,
      tags: ['test', 'weekly-digest'],
    });

    // Portfolio
    const portfolioItems = slotsToPortfolioItems(slots);
    if (portfolioItems.length > 0) {
      const portfolioHtml = portfolioNewsletter(portfolioItems);
      await sendEmail({
        to: [{ email: testEmail }],
        subject: `Neue Design-Projekte | KW${week} — Fly & Froth Studio Update`,
        htmlContent: portfolioHtml,
        tags: ['test', 'portfolio'],
      });
    }

    await sendMessage({
      chatId,
      text: `✅ 2 test maili ${testEmail} adresine gönderildi.\nGelen kutunu kontrol et, onaylarsan "Listeye gönder"e tıkla.`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleEmailDigestSend(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }

  const slots = await getSlotsByPlan(plan.id);
  if (slots.length === 0) { await sendMessage({ chatId, text: 'Planda slot yok.' }); return; }

  const listIds = emailListIds();
  const week = plan.calendar_week;
  const year = plan.year;

  await sendMessage({ chatId, text: `📧 KW${week} email bülteni listeye gönderiliyor…` });

  try {
    const result = await runWeeklyEmailCampaign(listIds, slots, week, year);
    if (result.error) {
      await sendMessage({ chatId, text: `❌ Email hatası: ${result.error}` });
      return;
    }
    const lines = ['✅ Email kampanyası gönderildi!'];
    if (result.digestId) lines.push(`📊 Weekly Digest: #${result.digestId}`);
    if (result.portfolioId) lines.push(`🖼 Portfolio Showcase: #${result.portfolioId}`);
    await sendMessage({ chatId, text: lines.join('\n') });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleEmailDigestCancel(chatId: number, _planId: string): Promise<void> {
  await sendMessage({ chatId, text: '✗ Email iptal edildi.' });
}

async function handleSlotBack(chatId: number, slotId: string): Promise<void> {
  const slot = await getSlot(slotId);
  if (!slot) return;
  const plan = await getPlan(slot.plan_id);
  if (!plan) return;
  const slots = await getSlotsByPlan(plan.id);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(plan.id, plan.status === 'approved') });
}

async function handleCommand(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const trimmed = text.trim();

  if (trimmed === '/start') {
    await sendMessage({ chatId, text: START_TEXT });
    return;
  }
  if (trimmed === '/help') {
    await sendMessage({ chatId, text: HELP_TEXT });
    return;
  }

  if (trimmed === '/refresh-profile' || trimmed === '/refresh_profile') {
    await handleRefreshProfileCommand(chatId);
    return;
  }
  if (trimmed === '/export-overrides' || trimmed === '/export_overrides') {
    await handleExportOverridesCommand(chatId);
    return;
  }
  if (trimmed === '/poll') {
    await handlePollCommand(chatId);
    return;
  }

  if (trimmed.startsWith('/edit_reply')) {
    await handleEditReplyCommand(chatId, trimmed.slice('/edit_reply'.length));
    return;
  }

  if (trimmed.startsWith('/preview_reply')) {
    const msgId = trimmed.slice('/preview_reply'.length).trim();
    if (!msgId) {
      await sendMessage({
        chatId,
        text: 'Kullanım: /preview_reply <msgId>',
      });
      return;
    }
    await handlePreviewReplyCommand(chatId, msgId);
    return;
  }

  if (trimmed.startsWith('/post')) {
    const topic = trimmed.slice('/post'.length).trim();
    if (!topic) {
      await sendMessage({
        chatId,
        text: 'Kullanım: /post <konu>\nÖrnek: /post Visitenkarten promosyonu, %20 indirim',
      });
      return;
    }
    await handlePostCommand(chatId, messageId, topic, 'post');
    return;
  }

  if (trimmed.startsWith('/story')) {
    const topic = trimmed.slice('/story'.length).trim();
    if (!topic) {
      await sendMessage({
        chatId,
        text: 'Kullanım: /story <konu>\nÖrnek: /story Heute geöffnet bis 18:00',
      });
      return;
    }
    await handlePostCommand(chatId, messageId, topic, 'ig_story');
    return;
  }

  if (trimmed.startsWith('/raw')) {
    await handleRawCommand(chatId);
    return;
  }

  if (trimmed.startsWith('/mail')) {
    await handleMailCommand(chatId, trimmed);
    return;
  }

  if (trimmed.startsWith('/fatura')) {
    await handleFaturaCommand(chatId);
    return;
  }

  if (trimmed === '/haftalik-plan' || trimmed === '/haftalik_plan') {
    await handleWeeklyPlanCommand(chatId);
    return;
  }

  if (trimmed === '/plan-durum' || trimmed === '/plan_durum') {
    await handlePlanStatusCommand(chatId);
    return;
  }

  if (trimmed === '/email-digest' || trimmed === '/email_digest') {
    await handleEmailDigestCommand(chatId);
    return;
  }

  if (trimmed === '/email-lists' || trimmed === '/email_lists') {
    await handleEmailListsCommand(chatId);
    return;
  }

  if (trimmed.startsWith('/email-outreach') || trimmed.startsWith('/email_outreach')) {
    const city = trimmed.replace(/^\/email[-_]outreach(@\w+)?\s*/, '').trim();
    if (!city) {
      await sendMessage({ chatId, text: 'Kullanım: /email-outreach <şehir>\nÖrnek: /email-outreach Frankfurt' });
      return;
    }
    await handleEmailOutreachCommand(chatId, city);
    return;
  }

  if (trimmed.startsWith('/email-reactivate') || trimmed.startsWith('/email_reactivate')) {
    const args = trimmed.replace(/^\/email[-_]reactivate(@\w+)?\s*/, '').trim();
    const parts = args.split(/\s+/);
    if (parts.length < 3) {
      await sendMessage({ chatId, text: 'Kullanım: /email-reactivate <email> <isim> <son_proje>\nÖrnek: /email-reactivate ahmet@x.com Ahmet "Logo Tasarımı"' });
      return;
    }
    const email = parts[0]!;
    const name = parts[1]!;
    const project = parts.slice(2).join(' ');
    await handleEmailReactivateCommand(chatId, email, name, project);
    return;
  }

  // Active Kleinanzeigen thread awaiting text input takes priority.
  const activeKz = await getActiveKleinanzeigenThread(chatId);
  if (activeKz) {
    await handleKzTextInput(chatId, activeKz, trimmed);
    return;
  }

  // Active invoice draft: drive the multi-step state machine first.
  const activeInvoice = await getActiveInvoiceDraft(chatId);
  if (activeInvoice && activeInvoice.status === 'collecting') {
    const handled = await handleInvoiceText(chatId, activeInvoice, trimmed);
    if (handled) return;
  }

  // Active mail draft awaiting regen — including the special pending-invoice
  // flow where the user's next message is the customer's email address.
  const activeDraft = await getActiveDraft(chatId);
  if (activeDraft && activeDraft.status === 'awaiting_regen') {
    if (activeDraft.instruction.startsWith('__INVOICE_PENDING__:')) {
      const looksLikeEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(trimmed);
      if (!looksLikeEmail) {
        await sendMessage({
          chatId,
          text: '⚠️ Geçerli bir email adresi yaz (sadece adres):',
        });
        return;
      }
      const recipientEmail = trimmed.trim();
      const updated = await updateDraft(activeDraft.id, {
        to_email: recipientEmail,
        instruction: '',
        status: 'drafting',
      });

      // Auto-add to Brevo contact list (don't block on failure)
      const invId = activeDraft.instruction.split(':')[1];
      if (invId) {
        try {
          const invoice = await getInvoice(invId);
          await createContact({
            email: recipientEmail,
            attributes: {
              NAME: invoice?.recipient?.name ?? '',
              COMPANY: invoice?.recipient?.company ?? '',
            },
            listIds: emailListIds(),
          });
        } catch { /* Brevo failure shouldn't block invoice sending */ }
      }

      const sent = await sendMessage({
        chatId,
        text: formatMailPreview(updated),
        replyMarkup: mailPreviewKeyboard(updated.id),
      });
      await updateDraft(updated.id, {
        telegram_preview_msg_id: sent.message_id,
      });
      return;
    }
    await applyMailRegen(chatId, activeDraft, trimmed);
    return;
  }

  await sendMessage({
    chatId,
    text: `❓ Anlamadım: "${trimmed}". /help yaz.`,
  });
}

async function handleCallback(
  query: TelegramCallbackQuery,
): Promise<void> {
  const data = query.data ?? '';
  const chatId = query.message?.chat.id ?? 0;
  const messageId = query.message?.message_id ?? 0;

  // Always answer to remove "loading" spinner in Telegram UI.
  await answerCallbackQuery({ callbackQueryId: query.id });

  if (!chatId) return;

  const [action, postId, ...rest] = data.split(':');

  try {
    if (action === 'approve' && postId) {
      await handleApprove(chatId, messageId, postId, false);
    } else if (action === 'approve_story' && postId) {
      await handleApprove(chatId, messageId, postId, true);
    } else if (action === 'regen_image' && postId) {
      await handleRegenImage(chatId, postId);
    } else if (action === 'regen_text' && postId) {
      await handleRegenText(chatId, postId);
    } else if (action === 'delete' && postId) {
      await handleDelete(chatId, messageId, postId);
    } else if (action === 'set_logo' && postId) {
      // Manual upload + logo decision (Task 23 territory).
      const choice = rest[0];
      await sendMessage({
        chatId,
        text: `🚧 Logo ${choice} seçimi: Task 23'te uygulanacak.`,
      });
    } else if (action === 'send_reply' && postId) {
      await handleSendReply(chatId, messageId, postId);
    } else if (action === 'edit_reply' && postId) {
      await handleEditReplyPrompt(chatId, postId);
    } else if (action === 'ignore_msg' && postId) {
      await handleIgnoreMessage(chatId, messageId, postId);
    } else if (action === 'mail_send' && postId) {
      await handleMailSend(chatId, messageId, postId);
    } else if (action === 'mail_regen' && postId) {
      await handleMailRegenPrompt(chatId, postId);
    } else if (action === 'mail_attach' && postId) {
      await handleMailAttachPrompt(chatId, postId);
    } else if (action === 'mail_cancel' && postId) {
      await handleMailCancel(chatId, messageId, postId);
    } else if (action === 'mail_reply' && postId) {
      await handleMailReply(chatId, postId);
    } else if (action === 'email_digest_test' && postId) {
      await handleEmailDigestTest(chatId, postId);
    } else if (action === 'email_digest_send' && postId) {
      await handleEmailDigestSend(chatId, postId);
    } else if (action === 'email_digest_cancel' && postId) {
      await handleEmailDigestCancel(chatId, postId);
    } else if (action === 'inv_type' && postId) {
      const t = postId as InvoiceTypeUnion;
      if (t === 'rechnung' || t === 'teilrechnung' || t === 'schlussrechnung') {
        await handleInvoiceTypeChoice(chatId, messageId, t);
      }
    } else if (action === 'inv_cancel') {
      await handleInvoiceCancel(chatId);
    } else if (action === 'inv_anzahlung_add' && postId) {
      await handleAnzahlungAdd(chatId, postId);
    } else if (action === 'inv_anzahlung_skip' && postId) {
      await handleAnzahlungSkip(chatId, postId);
    } else if (action === 'inv_item_more' && postId) {
      await handleInvoiceItemMore(chatId, postId);
    } else if (action === 'inv_no_more_items' && postId) {
      await handleInvoiceNoMoreItems(chatId, postId);
    } else if (action === 'inv_fp' && postId) {
      const key = rest[0] ?? '';
      await handleInvoiceFooterPreset(chatId, postId, key);
    } else if (action === 'inv_footer_manual' && postId) {
      await handleInvoiceFooterManual(chatId, postId);
    } else if (action === 'inv_footer_skip' && postId) {
      await handleInvoiceFooterSkip(chatId, postId);
    } else if (action === 'inv_number_auto' && postId) {
      await handleInvoiceNumberAuto(chatId, postId);
    } else if (action === 'inv_number_manual' && postId) {
      await handleInvoiceNumberManual(chatId, postId);
    } else if (action === 'inv_save' && postId) {
      await handleInvoiceSave(chatId, postId);
    } else if (action === 'inv_restart') {
      await handleInvoiceRestart(chatId);
    } else if (action === 'inv_delete' && postId) {
      await handleInvoiceDelete(chatId, postId);
    } else if (action === 'inv_send_mail' && postId) {
      await handleInvoiceSendMail(chatId, postId);
    } else if (action === 'kz_suggest' && postId) {
      await handleKzSuggest(chatId, messageId, postId);
    } else if (action === 'kz_alts' && postId) {
      await handleKzAlternatives(chatId, messageId, postId);
    } else if (action === 'kz_alt_type' && postId) {
      await handleKzAlternativeType(chatId, postId, rest[0] ?? '');
    } else if (action === 'kz_custom' && postId) {
      await handleKzCustom(chatId, messageId, postId);
    } else if (action === 'kz_reject' && postId) {
      await handleKzReject(chatId, messageId, postId);
    } else if (action === 'kz_send' && postId) {
      await handleKzSend(chatId, messageId, postId);
    } else if (action === 'kz_edit' && postId) {
      await handleKzEdit(chatId, postId);
    } else if (action === 'kz_regen' && postId) {
      await handleKzRegen(chatId, postId);
    } else if (action === 'kz_back' && postId) {
      await handleKzBack(chatId, postId);
    } else if (action === 'kz_gap_open' && postId) {
      await handleKzGapOpen(chatId, postId);
    } else if (action === 'kz_gap_yes' && postId) {
      await handleKzGapYes(chatId, postId);
    } else if (action === 'kz_gap_no' && postId) {
      await handleKzGapNo(chatId, postId);
    } else if (action === 'kz_gap_skip' && postId) {
      await handleKzGapSkip(chatId, postId);
    } else if (action === 'kz_attach' && postId) {
      await handleKzAttach(chatId, postId);
    } else if (action === 'kz_attach_clear' && postId) {
      await handleKzAttachClear(chatId, postId);
    } else if (action === 'kz_attach_done' && postId) {
      await handleKzAttachDone(chatId, postId);
    } else if (action === 'plan_approve_all' && postId) {
      await handlePlanApproveAll(chatId, messageId, postId);
    } else if (action === 'plan_regen' && postId) {
      await handlePlanRegen(chatId, postId);
    } else if (action === 'plan_discard' && postId) {
      await handlePlanDiscard(chatId, messageId, postId);
    } else if (action === 'plan_view' && postId) {
      await handlePlanView(chatId, postId);
    } else if (action === 'plan_edit' && postId) {
      await handlePlanEditPrompt(chatId, postId);
    } else if (action === 'slot_approve' && postId) {
      await handleSlotApprove(chatId, messageId, postId);
    } else if (action === 'slot_regen_topic' && postId) {
      await handleSlotRegenTopic(chatId, postId);
    } else if (action === 'slot_delete' && postId) {
      await handleSlotDelete(chatId, messageId, postId);
    } else if (action === 'slot_generate' && postId) {
      await handleSlotGenerate(chatId, messageId, postId);
    } else if (action === 'slot_back' && postId) {
      await handleSlotBack(chatId, postId);
    } else if (action === 'plan_cancel' && postId) {
      await handlePlanCancel(chatId, messageId, postId);
    } else {
      await sendMessage({ chatId, text: `❓ Bilinmeyen aksiyon: ${data}` });
    }
  } catch (err) {
    await notifyError(chatId, err);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ secret: string }> },
) {
  const { secret } = await ctx.params;
  const expected = webhookSecret();
  if (!expected || secret !== expected) {
    return new NextResponse('Not found', { status: 404 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const userId =
    update.message?.from?.id ?? update.callback_query?.from.id ?? 0;
  const chatId =
    update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? 0;

  if (!allowedUserIds().includes(userId)) {
    if (chatId) {
      await sendMessage({
        chatId,
        text: 'Bu bot özel — yalnızca yetkili kullanıcı için.',
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, ignored: 'unauthorized' });
  }

  // Kleinanzeigen image-attach intercept (priority over mail attachments).
  {
    const m = update.message;
    if (m && (m.photo?.length || m.document)) {
      const activeKzImage = await getActiveKleinanzeigenImageThread(chatId);
      if (activeKzImage) {
        if (m.document) {
          await kzAppendAttachment(chatId, activeKzImage, {
            fileId: m.document.file_id,
            filename: m.document.file_name ?? `attachment-${Date.now()}`,
            mime: m.document.mime_type ?? 'application/octet-stream',
            sizeBytes: m.document.file_size,
          });
        } else if (m.photo?.length) {
          const largest = m.photo[m.photo.length - 1];
          if (largest) {
            await kzAppendAttachment(chatId, activeKzImage, {
              fileId: largest.file_id,
              filename: `photo-${Date.now()}.jpg`,
              mime: 'image/jpeg',
              sizeBytes: largest.file_size,
            });
          }
        }
        return NextResponse.json({ ok: true });
      }
    }
  }

  // Mail-attachment interception: if a draft is awaiting an attachment,
  // any incoming photo or document is captured for that draft instead of
  // running the manual-image post flow.
  const msg = update.message;
  if (msg && (msg.photo?.length || msg.document)) {
    const activeDraft = await getActiveDraft(chatId);
    if (activeDraft && activeDraft.status === 'awaiting_attachment') {
      if (msg.document) {
        await applyMailAttachment(chatId, activeDraft, {
          fileId: msg.document.file_id,
          filename: msg.document.file_name ?? `attachment-${Date.now()}`,
          mime: msg.document.mime_type ?? 'application/octet-stream',
          sizeBytes: msg.document.file_size,
        });
      } else if (msg.photo?.length) {
        const largest = msg.photo[msg.photo.length - 1];
        if (largest) {
          await applyMailAttachment(chatId, activeDraft, {
            fileId: largest.file_id,
            filename: `photo-${Date.now()}.jpg`,
            mime: 'image/jpeg',
            sizeBytes: largest.file_size,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }
  }

  // Background-style: Telegram needs a 200 OK fast. We return after
  // dispatching, but each handler does its own send back.
  if (update.message?.photo && update.message.photo.length > 0) {
    await handlePhotoMessage(update.message);
  } else if (update.message?.text) {
    await handleCommand(
      chatId,
      update.message.message_id,
      update.message.text,
    );
  } else if (update.callback_query) {
    await handleCallback(update.callback_query);
  }

  return NextResponse.json({ ok: true });
}

