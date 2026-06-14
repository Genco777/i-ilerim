import { NextResponse, after } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
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
  handleApparelListCommand,
  handleApparelApproveCommand,
  handleApparelRejectCommand,
} from '@/lib/telegram/apparel-commands';
import {
  invoiceTypeKeyboard,
  invoiceItemMoreKeyboard,
  invoiceFooterKeyboard,
  invoiceNumberKeyboard,
  invoicePreviewKeyboard,
  schlussrechnungAnzahlungKeyboard,
  angebotFooterKeyboard,
  angebotNumberKeyboard,
  angebotPreviewKeyboard,
  angebotRemoveItemKeyboard,
} from '@/lib/telegram/invoice-keyboard';
import {
  cancelActiveDrafts as cancelActiveInvoiceDrafts,
  createDraft as createInvoiceDraft,
  getActiveDraft as getActiveInvoiceDraft,
  getInvoice,
  updateDraft as updateInvoiceDraft,
  appendItem as appendInvoiceItem,
  removeItem as removeInvoiceItem,
  setPendingItem as setInvoicePendingItem,
  setRecipient as setInvoiceRecipient,
  markPreview as markInvoicePreview,
  markSent as markInvoiceSent,
  markCancelled as markInvoiceCancelled,
  markDeleted as markInvoiceDeleted,
  getInvoiceByNumber,
  getAngebotByNumber,
  convertAngebotToInvoice,
  deleteAllInvoices,
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
  nextAngebotNumber,
  parseAngebotNumber,
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
  trendRejectSessions,
  trendEditTitleSessions,
  handleTrendApprove,
  handleTrendReject,
  handleTrendRegenVisual,
  handleTrendEditTitle,
  handleTrendRejectInput,
  handleTrendEditTitleInput,
} from '@/lib/trend/approval-handlers';
import {
  generatePost,
  regenerateImage,
  regenerateText,
} from '@/lib/content/generate-post';
import { generateWeeklyPlan, formatPlanForTelegram, getCurrentWeek } from '@/lib/content/generate-plan';
import { getPost, updatePost, deletePost } from '@/lib/db/queries/posts';
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
import { handleVoiceMessage } from '@/lib/agent/voice';
import {
  runWeeklyEmailCampaign,
  runCityOutreach,
  slotsToPortfolioItems,
  sendPortfolioNewsletter,
  sendReactivation,
} from '@/lib/email/campaigns';
import { weeklyDigest, portfolioNewsletter } from '@/lib/email/templates';
import type { DigestItem, PortfolioItem } from '@/lib/email/templates';
import { wrapInvoiceHtml } from '@/lib/email/invoice-email';
import { wrapAngebotHtml } from '@/lib/email/angebot-email';
import { wrapMailHtml } from '@/lib/email/mail-html';
import { generateEmailContent } from '@/lib/email/generate-content';
import type { EmailContent } from '@/lib/email/generate-content';
import { getLists, createContact, getContact, sendEmail, getAccount, createCampaign, sendCampaignNow } from '@/lib/email/brevo';
import {
  getWizardState,
  setWizardState,
  clearWizardState,
  type WizardState,
} from '@/lib/email/wizard-cache';
import {
  generateDigestContent,
  generateOutreachContent,
  generateReactivationContent,
  generateConcepts,
} from '@/lib/email/wizard-generate';
import { getEmailPreferences, updateEmailPreferences } from '@/lib/db/queries/email-preferences';
import { getRecentCampaigns, saveCampaign } from '@/lib/db/queries/email-campaigns';
import { THEME_META, type ThemeId, renderTheme } from '@/lib/email/themes';
import { renderPortfolioNewsletter, renderWeeklyDigest } from '@/lib/email/templates';
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
import {
  createAdsDraft,
  getActiveAdsDraft,
  getAdsDraft,
  updateAdsDraft,
  cancelActiveAdsDrafts,
  type AdsDraft,
} from '@/lib/db/queries/ads-drafts';
import {
  campaignTypeKeyboard,
  conversionGoalKeyboard,
  adsPreviewKeyboard,
  adsCancelKeyboard,
} from '@/lib/telegram/ads-keyboard';
import { generateAdCopy } from '@/lib/google-ads/ads-copy';
import { generateKeywords } from '@/lib/google-ads/keywords';
import {
  createSearchCampaign,
  pauseCampaign as pauseGoogleCampaign,
  resumeCampaign as resumeGoogleCampaign,
} from '@/lib/google-ads/campaigns';
import {
  listCampaignsByChat,
  getCampaign as getAdsCampaign,
} from '@/lib/db/queries/ads-campaigns';
import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import type { AdsCampaignType } from '@/lib/db/queries/ads-campaigns'; // used in Task 15
import { runAgentTurn, clearAgentSession } from '@/lib/agent';
import { notifyKleinanzeigenReply, notifyPostPublished } from '@/lib/agent/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// 300s — long-running commands (/post AI gen). Lambda kalır arka planda;
// webhook 200 hemen döner (fire-and-forget pattern aşağıda).
export const maxDuration = 300;

// ─────────────────────────────────────────────────────────────
// Idempotency — Telegram aynı update_id'yi retry sırasında defalarca
// gönderir (webhook 500/504 ya da timeout durumunda). In-memory dedup
// lambda warm-window içinde sorunu çözer.
// ─────────────────────────────────────────────────────────────
const SEEN_UPDATE_IDS = new Map<number, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;

function isDuplicateUpdate(updateId: number): boolean {
  const now = Date.now();
  if (SEEN_UPDATE_IDS.size > 500) {
    for (const [id, ts] of SEEN_UPDATE_IDS) {
      if (now - ts > SEEN_TTL_MS) SEEN_UPDATE_IDS.delete(id);
    }
  }
  if (SEEN_UPDATE_IDS.has(updateId)) return true;
  SEEN_UPDATE_IDS.set(updateId, now);
  return false;
}

// In-memory session for manual text editing (post caption)
const textEditSessions = new Map<number, string>(); // chatId -> postId
const planEditSessions = new Map<number, string>(); // chatId -> planId
interface PendingBrevoContact { email: string; name: string; listIds: number[] }
const pendingBrevoAdd = new Map<number, PendingBrevoContact>();
interface PendingGenerateTask { topic: string; agents: string[] }
const pendingGenerate = new Map<number, PendingGenerateTask>();

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
  voice?: { file_id: string; duration: number; mime_type?: string };
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
  '  /generate <açıklama>    — AI görsel oluşturucu (logo, flyer, menü, moodboard...)',
  '  /raw <metin>            — manuel paylaşım (foto ekle, AI dokunmaz)',
  '  /mail <email> <talimat> — AI yardımıyla mail taslağı + Zoho gönder',
  '  /fatura                 — adım adım PDF fatura oluştur (DE), müşteriye mail at',
  '  /angebot                — adım adım PDF Angebot oluştur, faturaya çevir',
'  /faturasil              — tüm faturaları soft delete yap',
  '  /edit_reply <id> <text> — gelen mesaja taslak cevabı düzenle',
  '  /preview_reply <id>     — taslağı butonlu önizle',
  '  /refresh-profile        — fly-froth.com/llms.txt cache temizle',
  '  /export-overrides       — Telegram\'dan eklenen overrideleri JSON olarak ver',
  '  /haftalik-plan           — Haftalık IG+FB içerik planı oluştur (AI)',
  '  /plan-durum              — Bu haftanın plan durumunu göster',
  '  /email-digest            — Haftalık planı email bülteni olarak gönder',
  '  /email-outreach <şehir>  — Lokal business outreach emaili (19 şehir)',
  '  /email-reactivate <email> <isim> <proje> — Eski müşteriye yeniden aktivasyon maili',
  '  /email-lists             — Brevo email listelerini göster',
  '  /liste ekle <email> [isim] — Email adresini Brevo kontakt listesine ekle',
  '',
  '🎯 Google Ads:',
  '  /ads new                — kampanya sihirbazı (AI metin + onay)',
  '  /ads list               — kampanyaları listele',
  '  /ads pause <id>         — kampanyayı durdur',
  '  /ads resume <id>        — kampanyayı devam ettir',
  '  /help                   — bu mesaj',
  '',
  '💬 AI Asistan:',
  '  /chat <mesaj>           — AI asistan ile sohbet (sormadan direkt mesaj da yazılabilir)',
  '  /chat_yeni              — yeni sohbet başlat',
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
    notifyKleinanzeigenReply(thread.id, thread.buyer_name ?? '');
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

async function handlePostCommand(
  chatId: number,
  messageId: number,
  topic: string,
  channel: 'post' | 'ig_story' = 'post',
): Promise<void> {
  const isStory = channel === 'ig_story';

  // BUG FIX — Webhook'u bloketmeden hemen "Üretiliyor" yanıtı yolla, AI gen
  // arka planda. Vercel 60s timeout'a takılıp Telegram'a 502 dönmüyor →
  // Telegram retry yapmıyor → "Üretiliyor" mesajı tek sefer geliyor.
  await sendMessage({
    chatId,
    text: isStory
      ? `📖 Story üretiliyor (9:16): "${topic}"\n(15-30 saniye…)`
      : `🎨 Üretiliyor: "${topic}"\n(15-30 saniye sürer, biraz bekle…)`,
  });

  // BUG FIX v2 — Vercel'de `void (async () => ...)` lambda response sonrası
  // ÖLÜYOR (process terminated). Next.js 15+ `after()` API explicit olarak
  // response sent sonrası arka planı canlı tutar (waitUntil ile).
  after(async () => {
    try {
      const post = await generatePost({
        topic,
        telegramChatId: String(chatId),
        telegramMessageId: String(messageId),
        channel,
        // Fikri Fabrik-style typography post: procedural @vercel/og + premium-vizyon
        // brand (indigo accent + bold Inter font + editorial layout). Canva Enterprise-only
        // olduğu için bıraktık. AI image yerine yerel typography render.
        useCanva: false,
        useProcedural: true,
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
      console.error('[post-bg] generatePost failed', err);
      await notifyError(chatId, err).catch(() => {});
    }
  });
}

async function handleGenerateCommand(
  chatId: number,
  _messageId: number,
  topic: string,
): Promise<void> {
  if (!topic) {
    await sendMessage({
      chatId,
      text: [
        '🎨 **Görsel Oluşturucu**',
        '',
        'Kullanım: `/generate <açıklama>`',
        '',
        'Örnekler:',
        '• `/generate logo: mavi altıgen, FF harfleri, modern`',
        '• `/generate yaz indirimi için A5 flyer`',
        '• `/generate Instagram görseli: kahve logosu`',
        '• `/generate restoran menüsü: İtalyan mutfağı`',
        '• `/generate moodboard: lüks kozmetik markası`',
        '• `/generate renk paleti: spa & wellness`',
        '',
        'Direkt `/chat` ile de tasarım isteyebilirsin.',
      ].join('\n'),
      parseMode: 'Markdown',
    });
    return;
  }

  // Konuyu ve boş seçim listesini sakla
  pendingGenerate.set(chatId, { topic, agents: [] });

  // Keyword analizi ile en uygun agent'ı bul
  const { routeToAgent } = await import('@/lib/agent/swarm');
  const route = routeToAgent(topic);
  const recommended = route.confidence >= 0.05 ? route.agent.name : null;

  const allAgents = [
    { name: 'sales_agent', emoji: '💰', role: 'Satış ve Müşteri İlişkileri' },
    { name: 'social_agent', emoji: '📱', role: 'Sosyal Medya ve İçerik' },
    { name: 'design_agent', emoji: '🎨', role: 'Tasarım ve Kreatif' },
    { name: 'finance_agent', emoji: '📊', role: 'Finans ve Raporlama' },
    { name: 'luxury_market_researcher', emoji: '🔍', role: 'Lüks Pazar Araştırma' },
    { name: 'luxury_buyer', emoji: '🛍️', role: 'Lüks Satın Alma' },
    { name: 'luxury_shopify_director', emoji: '🛒', role: 'Shopify E-Ticaret' },
    { name: 'luxury_marketing_director', emoji: '✨', role: 'Lüks Pazarlama' },
  ];

  const agentRows = allAgents.map((a) => [{
    text: `${a.emoji} ${a.role}${a.name === recommended ? ' ⭐' : ''}`,
    callback_data: `gen_agent:${a.name}`,
  }]);

  const keyboard = [
    ...agentRows,
    [{ text: '▶️ Başlat (seçili agent\'ları çalıştır)', callback_data: 'gen_run' }],
  ];

  const recInfo = recommended
    ? `\n⭐ Önerilen: ${allAgents.find(a => a.name === recommended)?.emoji} ${allAgents.find(a => a.name === recommended)?.role} — ${route.reason}`
    : '';

  await sendMessage({
    chatId,
    text: [
      `🎨 **"${topic.slice(0, 80)}${topic.length > 80 ? '...' : ''}"**`,
      '',
      'Agent seç (birden fazla seçebilirsin):',
      'Seçtikten sonra ▶️ **Başlat** butonuna bas.',
      recInfo,
      '',
      '📋 _Seçili: (yok)_',
    ].join('\n'),
    parseMode: 'Markdown',
    replyMarkup: { inline_keyboard: keyboard },
  });
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
    text: isStory
      ? '📤 Story yayınlanıyor (IG Story + FB)…'
      : '📤 Yayınlanıyor (FB Page + IG)…',
  });

  try {
    const result = isStory
      ? await publishStory(postId)
      : await publishPost(postId);

    notifyPostPublished(postId, isStory ? 'story' : 'post');

    const lines: string[] = ['✅ Yayınlandı!', ''];

    if (result.fbPostId) {
      lines.push(`📘 FB:  https://facebook.com/${result.fbPostId}`);
    } else if (result.fbError) {
      lines.push(`📘 FB:  ❌ ${result.fbError.slice(0, 120)}`);
    }

    if (result.igPostId) {
      if (result.igShortcode) {
        lines.push(`📷 IG:  https://instagram.com/p/${result.igShortcode}`);
      } else {
        lines.push(`📷 IG media id: ${result.igPostId}`);
      }
    } else if (result.igError) {
      lines.push(`📷 IG:  ❌ ${result.igError.slice(0, 120)}`);
    }

    if (isStory && result.igPostId) {
      lines.push('(Story Instagram\'da 24 saat görünür)');
    }

    await sendMessage({ chatId, text: lines.join('\n') });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleSchedule(
  chatId: number,
  messageId: number,
  postId: string,
  isStory: boolean,
): Promise<void> {
  const post = await getPost(postId);
  if (!post) {
    await sendMessage({ chatId, text: '⚠️ Post bulunamadı.' });
    return;
  }

  await updatePost(postId, { status: 'scheduled' });
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });

  const scheduledStr = post.scheduled_at
    ? new Date(post.scheduled_at).toLocaleString('tr-TR', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'planlanan saatte';

  await sendMessage({
    chatId,
    text: [
      '✅ Post plana dahil edildi.',
      `📅 ${scheduledStr} tarihinde otomatik yayınlanacak.`,
    ].join('\n'),
  });
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

async function handleEditText(
  chatId: number,
  postId: string,
): Promise<void> {
  const post = await getPost(postId);
  if (!post) { await sendMessage({ chatId, text: 'Post bulunamadı.' }); return; }
  textEditSessions.set(chatId, postId);
  await sendMessage({
    chatId,
    text: [
      '✏️ **Yeni metni yaz** (hashtag\'ler otomatik eklenir):',
      '',
      `Mevcut: ${(post.text_de ?? '').slice(0, 200)}…`,
    ].join('\n'),
  });
}

async function handleEditTextInput(
  chatId: number,
  newText: string,
): Promise<boolean> {
  const postId = textEditSessions.get(chatId);
  if (!postId) return false;
  textEditSessions.delete(chatId);

  const post = await getPost(postId);
  if (!post) { await sendMessage({ chatId, text: 'Post bulunamadı.' }); return true; }

  await updatePost(postId, { text_de: newText });
  const caption = [
    newText,
    '',
    (post.hashtags ?? []).map((h: string) => `#${h.replace(/^#/, '')}`).join(' '),
  ].join('\n');

  await sendMessage({
    chatId,
    text: `✅ Metin güncellendi:\n\n${caption.slice(0, 3500)}`,
    replyMarkup: previewKeyboard(postId, 'post'),
  });
  return true;
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

function formatAdsPreview(draft: AdsDraft): string {
  const p = draft.draft_payload;
  const copy = draft.generated_copy;
  const keywords = draft.generated_keywords ?? [];
  return [
    `🎯 Google Ads — ${p.type ?? '?'}`,
    `🔗 Hedef: ${p.target_url ?? '-'}`,
    `🎯 Goal: ${p.conversion_action ?? '-'}`,
    `💶 Günlük: €${((p.daily_budget_cents ?? 0) / 100).toFixed(2)}`,
    `📅 ${p.start_date ?? '?'} → ${p.end_date ?? 'açık uçlu'}`,
    '',
    '📝 Başlıklar:',
    ...(copy?.headlines ?? []).map((h, i) => `  ${i + 1}. ${h}`),
    '',
    '📄 Açıklamalar:',
    ...(copy?.descriptions ?? []).map((d, i) => `  ${i + 1}. ${d}`),
    '',
    `🔑 ${keywords.length} anahtar kelime: ${keywords
      .slice(0, 5)
      .map((k) => k.keyword)
      .join(', ')}${keywords.length > 5 ? '…' : ''}`,
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

async function handleAdsCommand(chatId: number, text: string): Promise<void> {
  const rest = text.replace(/^\/ads(@\w+)?\s*/, '').trim();
  const subcommand = rest.split(/\s+/)[0] || 'new';

  if (subcommand === 'new' || subcommand === '') {
    await cancelActiveAdsDrafts(chatId);
    const draft = await createAdsDraft(chatId);
    await sendMessage({
      chatId,
      text:
        '🎯 Google Ads kampanya sihirbazı.\nAdım 1/4: Kampanya tipini seç.',
      replyMarkup: campaignTypeKeyboard(draft.id),
    });
    return;
  }

  if (subcommand === 'list') {
    await handleAdsList(chatId);
    return;
  }

  if (subcommand === 'pause' || subcommand === 'resume') {
    const idArg = rest.split(/\s+/)[1];
    if (!idArg) {
      await sendMessage({
        chatId,
        text: `Kullanım: /ads ${subcommand} <id>`,
      });
      return;
    }
    await handleAdsStatusChange(chatId, idArg, subcommand);
    return;
  }

  await sendMessage({
    chatId,
    text:
      'Kullanım:\n  /ads new              — yeni kampanya sihirbazı\n  /ads list             — aktif kampanyalar\n  /ads pause <id>       — durdur\n  /ads resume <id>      — devam ettir',
  });
}

async function handleAdsList(chatId: number): Promise<void> {
  const rows = await listCampaignsByChat(chatId, ['enabled', 'paused']);
  if (rows.length === 0) {
    await sendMessage({ chatId, text: '📭 Aktif kampanya yok. /ads new ile başla.' });
    return;
  }
  const lines = rows.map((r) => {
    const flag = r.status === 'enabled' ? '🟢' : '⏸️';
    const budget = `€${(r.daily_budget_cents / 100).toFixed(2)}/gün`;
    const shortId = r.id.slice(0, 8);
    return `${flag} ${shortId}  ${r.name}  ${budget}`;
  });
  await sendMessage({
    chatId,
    text: ['📋 Kampanyalar:', ...lines, '', '/ads pause <id> ile durdur'].join('\n'),
  });
}

async function handleAdsStatusChange(
  chatId: number,
  idArg: string,
  action: 'pause' | 'resume',
): Promise<void> {
  // Allow short-prefix matching (first 8 chars displayed in /ads list)
  let campaign = await getAdsCampaign(idArg);
  if (!campaign) {
    const all = await listCampaignsByChat(chatId, ['enabled', 'paused']);
    campaign = all.find((c) => c.id.startsWith(idArg)) ?? null;
  }
  if (!campaign) {
    await sendMessage({ chatId, text: `❌ Kampanya bulunamadı: ${idArg}` });
    return;
  }
  try {
    if (action === 'pause') await pauseGoogleCampaign(campaign.id);
    else await resumeGoogleCampaign(campaign.id);
    await sendMessage({
      chatId,
      text: `${action === 'pause' ? '⏸️ Durduruldu' : '▶️ Yeniden başladı'}: ${campaign.name}`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleAdsTextInput(
  chatId: number,
  draft: AdsDraft,
  text: string,
): Promise<void> {
  if (draft.current_step === 'target') {
    const url = text.trim();
    if (!/^https?:\/\//.test(url)) {
      await sendMessage({
        chatId,
        text: '🔗 Geçerli bir URL gönder (https:// ile başlamalı).',
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }
    await updateAdsDraft(draft.id, {
      draft_payload: { ...draft.draft_payload, target_url: url },
      current_step: 'budget',
    });
    await sendMessage({
      chatId,
      text:
        '💶 Adım 3/4: Günlük bütçeyi yaz (EUR, örn. `15` veya `15.50`).\nKısa süreli kampanya istiyorsan bütçe satırında bitiş tarihi de yazabilirsin: `15 / 2026-06-15`',
      replyMarkup: adsCancelKeyboard(draft.id),
    });
    return;
  }

  if (draft.current_step === 'budget') {
    const match = text.trim().match(/^(\d+(?:[.,]\d{1,2})?)(?:\s*\/\s*(\d{4}-\d{2}-\d{2}))?$/);
    if (!match) {
      await sendMessage({
        chatId,
        text: '❌ Format: `15` veya `15.50` veya `15 / 2026-06-15`',
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }
    const dailyEur = parseFloat(match[1]!.replace(',', '.'));
    const endDate = match[2] ?? null;
    const dailyCents = Math.round(dailyEur * 100);

    const prefs = await getAdsPreferences();
    if (dailyCents > prefs.daily_limit_cents) {
      await sendMessage({
        chatId,
        text: `❌ Günlük limit €${(prefs.daily_limit_cents / 100).toFixed(2)} aşıldı. /ads limits ile değiştir.`,
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    await updateAdsDraft(draft.id, {
      draft_payload: {
        ...draft.draft_payload,
        daily_budget_cents: dailyCents,
        start_date: today,
        end_date: endDate ?? undefined,
        campaign_name:
          draft.draft_payload.campaign_name ??
          `${draft.draft_payload.type ?? 'ads'} - ${today}`,
      },
      current_step: 'copy_review',
    });

    await sendMessage({ chatId, text: '🤖 Adım 4/4: AI metin + anahtar kelime üretiliyor…' });
    await runAdsGeneration(chatId, draft.id);
    return;
  }
}

async function runAdsGeneration(chatId: number, draftId: string): Promise<void> {
  const draft = await getAdsDraft(draftId);
  if (!draft) return;
  const p = draft.draft_payload;
  if (!p.type || !p.target_url) {
    await sendMessage({ chatId, text: '❌ Taslakta tip veya URL eksik.' });
    return;
  }
  try {
    const prefs = await getAdsPreferences();
    const [copy, keywords] = await Promise.all([
      generateAdCopy({
        campaignType: p.type,
        targetUrl: p.target_url,
        conversionGoal: p.conversion_action ?? null,
      }),
      generateKeywords({
        targetUrl: p.target_url,
        campaignContext: p.conversion_action ?? 'general',
        languageCode: prefs.default_language_code,
        locationId: prefs.default_location_id,
      }),
    ]);

    const updated = await updateAdsDraft(draftId, {
      generated_copy: copy,
      generated_keywords: keywords,
      status: 'awaiting_approval',
      current_step: 'approval',
    });

    const sent = await sendMessage({
      chatId,
      text: formatAdsPreview(updated),
      replyMarkup: adsPreviewKeyboard(draftId),
    });
    await updateAdsDraft(draftId, { telegram_preview_msg_id: sent.message_id });
  } catch (err) {
    await updateAdsDraft(draftId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
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
    const hasPdf = draft.attachments.some((a) => a.filename.endsWith('.pdf'));
    const isAngebot = draft.attachments.some((a) => a.filename.startsWith('Angebot_'));
    const html = hasPdf
      ? isAngebot
        ? wrapAngebotHtml({ subject: draft.subject, bodyText: draft.body })
        : wrapInvoiceHtml({ subject: draft.subject, bodyText: draft.body })
      : wrapMailHtml({ subject: draft.subject, bodyText: draft.body });
    const result = await sendMail({
      to: draft.to_email,
      subject: draft.subject,
      body: draft.body,
      ...(html ? { html } : {}),
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

    // Post-send: ask about Brevo contact list for invoice/angebot sends
    const isFromInvoice = draft.instruction?.startsWith('__FROM_INVOICE__:');
    const isFromAngebot = draft.instruction?.startsWith('__FROM_ANGEBOT__:');
    if (isFromInvoice || isFromAngebot) {
      try {
        const existing = await getContact(draft.to_email);
        if (!existing) {
          let recipientName = '';
          const refId = draft.instruction!.split(':')[1];
          if (refId) {
            try {
              const ref = await getInvoice(refId);
              recipientName = ref?.recipient?.name ?? '';
            } catch { /* ignore */ }
          }

          pendingBrevoAdd.set(chatId, {
            email: draft.to_email,
            name: recipientName,
            listIds: emailListIds(),
          });

          await sendMessage({
            chatId,
            text: `📬 Bu emaili Brevo kontakt listesine eklemek ister misin?\n\n📧 ${draft.to_email}`,
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: '✅ Evet', callback_data: 'brevo_add:yes' },
                  { text: '❌ Hayır', callback_data: 'brevo_add:no' },
                ],
              ],
            },
          });
        }
      } catch { /* don't block mail send for Brevo prompt failures */ }
    }
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

async function handleMailTranslate(
  chatId: number,
  inboxId: string,
  callbackQueryId?: string,
): Promise<void> {
  const inbox = await getInboxById(inboxId);
  if (!inbox) {
    await sendMessage({ chatId, text: `❓ Mail bulunamadı: ${inboxId}` });
    return;
  }

  const bodyText = (inbox as any).body_text ?? inbox.body_preview ?? '';
  if (!bodyText.trim()) {
    await answerCallbackQuery({ callbackQueryId: callbackQueryId ?? '', text: '⚠️ Bu mailde çevrilecek metin yok.' });
    return;
  }

  if (callbackQueryId) {
    try { await answerCallbackQuery({ callbackQueryId, text: '🌐 Çevriliyor…' }); } catch { /* ok */ }
  }

  const subject = inbox.subject ?? '';
  const fromLine = inbox.from_name
    ? `${inbox.from_name} <${inbox.from_email}>`
    : inbox.from_email;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const raw = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: 'Du bist ein professioneller Übersetzer. Übersetze den folgenden Text ins Türkische. Behalte Formatierung und Ton bei. Gib NUR die Übersetzung zurück, keine Erklärungen.',
      messages: [{ role: 'user', content: bodyText }],
    }).then((r) => {
      const block = r.content[0];
      if (!block || block.type !== 'text') throw new Error('No text from Claude');
      return block.text;
    });

    const text = [
      `🌐 *Çeviri*`,
      `Kimden: ${fromLine}`,
      `Konu: ${subject}`,
      '',
      raw.slice(0, 3800),
      '',
      `_Orijinal mailin altındaki butonlarla cevap yazabilirsin._`,
    ].join('\n');

    await sendMessage({ chatId, text, parseMode: 'Markdown' });
  } catch (err) {
    console.error('handleMailTranslate error:', err);
    await sendMessage({ chatId, text: '⚠️ Çeviri sırasında hata oluştu. Tekrar dene.' });
  }
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

const ANGEBOT_FOOTER_PRESETS: Record<string, string> = {
  ap1: 'Angebot freibleibend.',
};

function validUntilFromToday(plusDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + plusDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function invoiceToData(inv: Invoice): InvoiceData {
  if (!inv.recipient) {
    throw new Error('Invoice has no recipient — cannot render');
  }
  return {
    number: inv.number,
    type: inv.type,
    date: inv.date,
    validUntil: inv.valid_until ?? undefined,
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

async function handleAngebotCommand(chatId: number): Promise<void> {
  await cancelActiveInvoiceDrafts(chatId);
  const draft = await createInvoiceDraft({ chatId, type: 'angebot' });
  await sendMessage({
    chatId,
    text: '📋 Yeni Angebot\n\nMüşteri (sadece kişi adı, şirket varsa "Şirket / Kişi Adı" formatında):',
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

async function moveToAngebotFooterStep(
  chatId: number,
  draftId: string,
): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'footer' });
  await sendMessage({
    chatId,
    text: 'Alt not — bir tane seç ya da yaz:',
    replyMarkup: angebotFooterKeyboard(draftId),
  });
}

async function moveToAngebotNumberStep(
  chatId: number,
  draftId: string,
): Promise<void> {
  const auto = await nextAngebotNumber();
  await updateInvoiceDraft(draftId, { current_step: 'number' });
  await sendMessage({
    chatId,
    text: `Angebot no önerisi: ${auto}`,
    replyMarkup: angebotNumberKeyboard(draftId, auto),
  });
}

function summarizeAngebot(inv: Invoice): string {
  const recipient = inv.recipient
    ? [inv.recipient.company, inv.recipient.name, inv.recipient.street, inv.recipient.zipCity]
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
    `📋 ANGEBOT #${inv.number}`,
    `📅 ${inv.date}`,
    inv.valid_until ? `⏳ Gültig bis: ${inv.valid_until}` : '',
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

async function buildAndPreviewAngebot(
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
      filename: `Angebot_${draft.number}.pdf`,
      mime: 'application/pdf',
      caption: summarizeAngebot(draft).slice(0, 1024),
    });
    await sendMessage({
      chatId,
      text: 'Şimdi ne yapayım?',
      replyMarkup: angebotPreviewKeyboard(draft.id),
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

async function handleAngebotText(
  chatId: number,
  draft: Invoice,
  text: string,
): Promise<boolean> {
  const step = draft.current_step;

  // --- recipient_name ---
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
    const today = todayDDMMYYYY();
    const vu = validUntilFromToday(2);
    await updateInvoiceDraft(draft.id, {
      current_step: 'valid_until',
      date: today,
    });
    await sendMessage({
      chatId,
      text: `Tarih: ${today}\n\nGültig bis (son geçerlilik)?\nVarsayılan: ${vu}\n\n"Y" ya da DD.MM.YYYY yaz:`,
    });
    return true;
  }

  // --- valid_until ---
  if (step === 'valid_until') {
    let vu: string;
    if (text.trim().toUpperCase() === 'Y' || text.trim().toLowerCase() === 'ok') {
      vu = validUntilFromToday(2);
    } else {
      const parsed = parseGermanDate(text);
      if (!parsed) {
        await sendMessage({
          chatId,
          text: '⚠️ Tarih formatı yanlış. DD.MM.YYYY ya da "Y" yaz.',
        });
        return true;
      }
      vu = parsed;
    }
    await updateInvoiceDraft(draft.id, {
      current_step: 'item_description',
      valid_until: vu,
    });
    await sendMessage({ chatId, text: 'Hizmet/ürün açıklaması?' });
    return true;
  }

  // --- item_description ---
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

  // --- item_price ---
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

  // --- item_quantity ---
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
    if (!pending?.description || typeof pending.unitPriceCents !== 'number') {
      await sendMessage({
        chatId,
        text: '🔴 İç hata: kalem bilgileri eksik. /angebot ile yeniden başla.',
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

  // --- footer_manual ---
  if (step === 'footer_manual') {
    const note = text.trim();
    await updateInvoiceDraft(draft.id, { footer_note: note || null });
    await moveToAngebotNumberStep(chatId, draft.id);
    return true;
  }

  // --- number_manual ---
  if (step === 'number_manual') {
    const trimmed = text.trim();
    const parsed = parseAngebotNumber(trimmed);
    if (!parsed) {
      await sendMessage({
        chatId,
        text: '⚠️ Format: YYYY-AN-NNN (4 hane yıl, AN, 3 hane sayı)\nÖrnek: 2026-AN-051',
      });
      return true;
    }
    const existing = await getAngebotByNumber(trimmed);
    if (existing && existing.id !== draft.id) {
      await sendMessage({
        chatId,
        text: `⚠️ ${trimmed} numaralı Angebot zaten var. Başka bir numara yaz.`,
      });
      return true;
    }
    const finalDraft = await updateInvoiceDraft(draft.id, {
      number: trimmed,
      current_step: 'confirm',
    });
    await buildAndPreviewAngebot(chatId, finalDraft);
    return true;
  }

  // --- convert_address (Angebot → Rechnung dönüşümünde adres sorulur) ---
  if (step === 'convert_address') {
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
        text: '🔴 İç hata: alıcı kaydı yok.',
      });
      return true;
    }
    await setInvoiceRecipient(draft.id, {
      company: draft.recipient.company,
      name: draft.recipient.name,
      street: parsed.street,
      zipCity: parsed.zipCity,
    });
    // Ask for invoice number
    const auto = await nextInvoiceNumber();
    await updateInvoiceDraft(draft.id, { current_step: 'convert_number' });
    await sendMessage({
      chatId,
      text: `Fatura numarası?\nVarsayılan: ${auto}\n\n"Y" ya da YYYY-NNN formatında yaz:`,
    });
    return true;
  }

  // --- convert_number (Angebot → Rechnung dönüşümünde fatura numarası sorulur) ---
  if (step === 'convert_number') {
    const trimmed = text.trim();
    let finalNumber: string;
    if (trimmed.toUpperCase() === 'Y' || trimmed.toLowerCase() === 'ok') {
      finalNumber = await nextInvoiceNumber();
    } else {
      const parsed = parseInvoiceNumber(trimmed);
      if (!parsed) {
        await sendMessage({
          chatId,
          text: '⚠️ Format: YYYY-NNN (4 hane yıl, 3 hane sayı)\nÖrnek: 2026-051',
        });
        return true;
      }
      finalNumber = trimmed;
      const existing = await getInvoiceByNumber(finalNumber);
      if (existing && existing.id !== draft.id) {
        await sendMessage({
          chatId,
          text: `⚠️ ${finalNumber} numaralı fatura zaten var. Başka bir numara yaz.`,
        });
        return true;
      }
    }
    const invoice = await convertAngebotToInvoice(draft.id, finalNumber);
    await sendMessage({
      chatId,
      text: `✅ Angebot #${draft.number} → Rechnung #${invoice.number} dönüştürüldü.\n\n/fatura ile devam edebilirsin.`,
    });
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
  let finalNumber = draft.pending_item?.suggestedNumber ?? (await nextInvoiceNumber());
  for (let i = 0; i < 5; i++) {
    const existing = await getInvoiceByNumber(finalNumber);
    if (!existing || existing.id === draft.id) break;
    finalNumber = await nextInvoiceNumber();
  }
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

async function handleDeleteAllInvoices(chatId: number): Promise<void> {
  await cancelActiveInvoiceDrafts(chatId);
  const count = await deleteAllInvoices();
  await sendMessage({
    chatId,
    text: `🗑 ${count} fatura silindi (soft delete). Hepsi "deleted" durumunda.`,
  });
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

async function handleAngebotItemMore(chatId: number, draftId: string): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'item_description' });
  await sendMessage({ chatId, text: 'Yeni kalemin açıklaması?' });
}

async function handleAngebotNoMoreItems(chatId: number, draftId: string): Promise<void> {
  await moveToAngebotFooterStep(chatId, draftId);
}

async function handleAngebotFooterPreset(
  chatId: number,
  draftId: string,
  key: string,
): Promise<void> {
  const note = ANGEBOT_FOOTER_PRESETS[key] ?? null;
  await updateInvoiceDraft(draftId, { footer_note: note });
  await moveToAngebotNumberStep(chatId, draftId);
}

async function handleAngebotFooterManual(chatId: number, draftId: string): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'footer_manual' });
  await sendMessage({ chatId, text: 'Notu yaz (tek satırlık serbest metin):' });
}

async function handleAngebotFooterSkip(chatId: number, draftId: string): Promise<void> {
  await updateInvoiceDraft(draftId, { footer_note: null });
  await moveToAngebotNumberStep(chatId, draftId);
}

async function handleAngebotNumberAuto(chatId: number, draftId: string): Promise<void> {
  const draft = await getInvoice(draftId);
  if (!draft) return;
  let finalNumber = await nextAngebotNumber();
  for (let i = 0; i < 5; i++) {
    const existing = await getAngebotByNumber(finalNumber);
    if (!existing || existing.id === draft.id) break;
    finalNumber = await nextAngebotNumber();
  }
  const updated = await updateInvoiceDraft(draftId, {
    number: finalNumber,
    current_step: 'confirm',
  });
  await buildAndPreviewAngebot(chatId, updated);
}

async function handleAngebotNumberManual(chatId: number, draftId: string): Promise<void> {
  await updateInvoiceDraft(draftId, { current_step: 'number_manual' });
  await sendMessage({
    chatId,
    text: 'Yeni numara? Format: YYYY-AN-NNN\nÖrnek: 2026-AN-051',
  });
}

async function handleAngebotSave(chatId: number, draftId: string): Promise<void> {
  await markInvoiceSent(draftId);
  const d = await getInvoice(draftId);
  await sendMessage({
    chatId,
    text: `💾 Angebot ${d?.number ?? draftId} kaydedildi.`,
  });
}

async function handleAngebotRestart(chatId: number): Promise<void> {
  await cancelActiveInvoiceDrafts(chatId);
  await handleAngebotCommand(chatId);
}

async function handleAngebotDelete(chatId: number, draftId: string): Promise<void> {
  await markInvoiceDeleted(draftId);
  const d = await getInvoice(draftId);
  await sendMessage({
    chatId,
    text: `🗑 ${d?.number ?? draftId} silindi.`,
  });
}

async function handleAngebotSendMail(chatId: number, invoiceId: string): Promise<void> {
  const inv = await getInvoice(invoiceId);
  if (!inv) {
    await sendMessage({ chatId, text: `❓ Angebot bulunamadı: ${invoiceId}` });
    return;
  }
  if (!inv.recipient) {
    await sendMessage({
      chatId,
      text: '🔴 Angebot\'ta alıcı yok — mail atılamaz.',
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

    await cancelActiveDrafts(chatId);

    await sendMessage({
      chatId,
      text: 'Müşterinin email adresini yaz (sadece adres):',
    });
    await createDraft({
      to_email: 'pending@angebot.local',
      subject: cover.subject,
      body: cover.body,
      instruction: `__ANGEBOT_PENDING__:${inv.id}`,
      telegram_chat_id: chatId,
      status: 'awaiting_regen',
      attachments: [
        {
          filename: `Angebot_${inv.number}.pdf`,
          mime: 'application/pdf',
          base64: pdfBuf.toString('base64'),
        },
      ],
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleAngebotAddItem(chatId: number, draftId: string): Promise<void> {
  await updateInvoiceDraft(draftId, { status: 'collecting', current_step: 'item_description' });
  await sendMessage({ chatId, text: 'Yeni kalemin açıklaması?' });
}

async function handleAngebotRemoveItem(chatId: number, draftId: string): Promise<void> {
  const draft = await getInvoice(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: '❓ Angebot bulunamadı.' });
    return;
  }
  const items = (draft.items ?? []) as { description: string; unitPriceCents: number; quantity: number }[];
  if (items.length === 0) {
    await sendMessage({ chatId, text: 'Silinecek kalem yok.' });
    return;
  }
  await sendMessage({
    chatId,
    text: 'Hangi kalemi silelim?',
    replyMarkup: angebotRemoveItemKeyboard(draftId, items),
  });
}

async function handleAngebotItemRemove(
  chatId: number,
  draftId: string,
  index: number,
): Promise<void> {
  try {
    await removeInvoiceItem(draftId, index);
  } catch {
    await sendMessage({ chatId, text: '⚠️ Kalem silinemedi, tekrar dene.' });
    return;
  }
  const draft = await getInvoice(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: '❓ Angebot kayboldu.' });
    return;
  }
  await buildAndPreviewAngebot(chatId, draft);
}

async function handleAngebotBack(chatId: number, draftId: string): Promise<void> {
  const draft = await getInvoice(draftId);
  if (!draft) {
    await sendMessage({ chatId, text: '❓ Angebot bulunamadı.' });
    return;
  }
  await buildAndPreviewAngebot(chatId, draft);
}

async function handleAngebotConvert(chatId: number, draftId: string): Promise<void> {
  const angebot = await getInvoice(draftId);
  if (!angebot) {
    await sendMessage({ chatId, text: '❓ Angebot bulunamadı.' });
    return;
  }

  // If the Angebot has no address, ask for it before converting
  const hasAddress =
    angebot.recipient?.street?.trim() || angebot.recipient?.zipCity?.trim();
  if (!hasAddress) {
    await updateInvoiceDraft(draftId, { status: 'collecting', current_step: 'convert_address' });
    await sendMessage({
      chatId,
      text: 'Fatura için adres gerekli.\n\nAdres? Format: Sokak No, PLZ Şehir\nÖrnek: Hauptstraße 5, 60311 Frankfurt',
    });
    return;
  }

  // Ask for invoice number
  const auto = await nextInvoiceNumber();
  await updateInvoiceDraft(draftId, { status: 'collecting', current_step: 'convert_number' });
  await sendMessage({
    chatId,
    text: `Fatura numarası?\nVarsayılan: ${auto}\n\n"Y" ya da YYYY-NNN formatında yaz:`,
  });
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

  // Kick off the first batch. The generate-plan-slots endpoint now
  // self-iterates: each batch triggers the next one via a new function
  // invocation, so the chain survives even if this webhook times out.
  const baseUrl = process.env.APP_URL ?? 'https://admin.fly-froth.com';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    await sendMessage({ chatId, text: '🔴 İç hata: CRON_SECRET eksik.' });
    return;
  }

  try {
    const res = await fetch(`${baseUrl}/api/generate-plan-slots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ planId, chatId }),
    });
    const result = await res.json().catch(() => ({}));
    const processed = result.processed ?? 0;
    await sendMessage({
      chatId,
      text: `✅ Tüm slotlar işlendi. ${processed}/${topicsToGenerate.length} başarılı.`,
    });
  } catch (err) {
    console.error(`[plan] Initial batch dispatch failed:`, err);
    // Check if the endpoint managed to start the chain despite the fetch error
    try {
      const slots = await getSlotsByPlan(planId);
      const stillPending = slots.filter(
        (s) => s.status === 'pending' && s.topic,
      ).length;
      if (stillPending === 0) {
        await sendMessage({
          chatId,
          text: `✅ Slotlar işlenmiş görünüyor (batch zinciri devraldı).`,
        });
      } else if (stillPending < topicsToGenerate.length) {
        await sendMessage({
          chatId,
          text: `⚠️ Kısmi ilerleme: ${topicsToGenerate.length - stillPending} işlendi, ${stillPending} kaldı. "/plan-durum" ile kontrol et, gerekirse tekrar "/plan-onayla" yaz.`,
        });
      } else {
        await sendMessage({
          chatId,
          text: `⚠️ Batch zinciri başlatılamadı: ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}. Tekrar "/plan-onayla" yaz.`,
        });
      }
    } catch {
      await sendMessage({
        chatId,
        text: `⚠️ Batch başlatılamadı. Tekrar "/plan-onayla" yaz.`,
      });
    }
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
  planEditSessions.set(chatId, planId);
  const lines = slots.map((s, i) => {
    const day = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][s.day_of_week] ?? '??';
    return `${i + 1}. ${day} ${s.time_slot} [${s.pillar}] ${s.topic ?? '(leer)'}`;
  });
  await sendMessage({
    chatId,
    text: ['✏️ Slot seçmek için numarasını yaz (örn. "3"), veya "iptal":', '', ...lines].join('\n'),
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
      channel: slot.channel === 'reel' || slot.channel === 'story' ? 'ig_story' : 'post',
      pillar: slot.pillar,
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    const variant = slot.channel === 'story' ? 'story' as const : 'post' as const;
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}\n\n${(post.hashtags ?? []).map((h: string) => `#${h}`).join(' ')}`.slice(0, 1024),
      replyMarkup: previewKeyboard(post.id, variant),
    });
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
      channel: slot.channel === 'reel' || slot.channel === 'story' ? 'ig_story' : 'post',
      pillar: slot.pillar,
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    const variant = slot.channel === 'story' ? 'story' as const : 'post' as const;
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}`.slice(0, 1024),
      replyMarkup: previewKeyboard(post.id, variant),
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
  let currentTheme: ThemeId = 'dark_steel';
  try {
    const prefs = await getEmailPreferences();
    if (prefs.theme === 'dark_steel' || prefs.theme === 'light_steel' || prefs.theme === 'dark_gold') {
      currentTheme = prefs.theme;
    }
  } catch { /* use default */ }

  let pastSubjects: string[] = [];
  try {
    const past = await getRecentCampaigns(10);
    pastSubjects = past.filter((c) => c.campaignType === 'digest').map((c) => c.subjectLine);
  } catch { /* ok if table doesn't exist yet */ }

  const state: WizardState = {
    chatId,
    step: 'concept',
    campaignType: 'digest',
    theme: currentTheme,
  };
  await setWizardState(chatId, state);

  await sendMessage({ chatId, text: '🤖 Kampanya konseptleri oluşturuluyor... (10-15 saniye)' });

  try {
    const concepts = await generateConcepts('digest', pastSubjects);
    state.concepts = concepts;
    await setWizardState(chatId, state);

    const keyboard = concepts.map((c, i) => [
      { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
    ]);
    keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
    keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

    await sendMessage({
      chatId,
      text: [
        '📧 Email Kampanya Konseptleri',
        '',
        ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
        '',
        'Bir konsept seç:',
      ].join('\n'),
      replyMarkup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    await clearWizardState(chatId);
    await sendMessage({
      chatId,
      text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
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

async function handleListeEkleCommand(chatId: number, args: string): Promise<void> {
  const parts = args.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    await sendMessage({
      chatId,
      text: '⚠️ Kullanım: /liste ekle <email> [isim]\nÖrnek: /liste ekle ahmet@ornek.com Ahmet',
    });
    return;
  }

  const email = parts[0]!.trim().toLowerCase();
  if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email)) {
    await sendMessage({ chatId, text: `⚠️ "${email}" geçerli bir email adresi değil.` });
    return;
  }

  const name = parts.slice(1).join(' ').trim();

  try {
    const existing = await getContact(email);
    if (existing) {
      const listInfo = existing.listIds?.length
        ? ` (liste #${existing.listIds.join(', ')})`
        : '';
      await sendMessage({
        chatId,
        text: `ℹ️ ${email} zaten Brevo kontakt listesinde${listInfo}.`,
      });
      return;
    }

    const listIds = emailListIds();
    if (listIds.length === 0) {
      await sendMessage({
        chatId,
        text: '⚠️ BREVO_LIST_IDS env değişkeni ayarlanmamış.',
      });
      return;
    }

    await createContact({
      email,
      attributes: name ? { NAME: name } : {},
      listIds,
    });

    await sendMessage({
      chatId,
      text: `✅ ${email}${name ? ` (${name})` : ''} Brevo kontakt listesine eklendi.`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handleBrevoAddCallback(
  chatId: number,
  messageId: number,
  choice: string,
): Promise<void> {
  const pending = pendingBrevoAdd.get(chatId);
  if (!pending) {
    await sendMessage({ chatId, text: '⏰ Bu işlem zaman aşımına uğradı.' });
    return;
  }
  pendingBrevoAdd.delete(chatId);

  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });

  if (choice === 'yes') {
    try {
      await createContact({
        email: pending.email,
        attributes: pending.name ? { NAME: pending.name } : {},
        listIds: pending.listIds,
      });
      await sendMessage({
        chatId,
        text: `✅ ${pending.email} Brevo kontakt listesine eklendi.`,
      });
    } catch (err) {
      await notifyError(chatId, err);
    }
  } else {
    await sendMessage({
      chatId,
      text: `👌 ${pending.email} listeye eklenmedi.`,
    });
  }
}

async function handleGenAgentCallback(
  chatId: number,
  messageId: number,
  agentName: string,
): Promise<void> {
  const task = pendingGenerate.get(chatId);
  if (!task) {
    await answerCallbackQuery({ callbackQueryId: '', text: '⏰ İstek süresi doldu.' });
    return;
  }

  // Toggle agent selection
  const idx = task.agents.indexOf(agentName);
  if (idx >= 0) {
    task.agents.splice(idx, 1);
    await answerCallbackQuery({ callbackQueryId: '', text: `❌ Çıkarıldı: ${agentName}` });
  } else {
    task.agents.push(agentName);
    await answerCallbackQuery({ callbackQueryId: '', text: `✅ Eklendi: ${agentName}` });
  }

  // Update message to show current selection
  const selectedText = task.agents.length > 0
    ? task.agents.join(', ')
    : '(yok)';
  await editMessageText({
    chatId,
    messageId,
    text: [
      `🎨 **"${task.topic.slice(0, 80)}${task.topic.length > 80 ? '...' : ''}"**`,
      '',
      'Agent seç (birden fazla seçebilirsin):',
      'Seçtikten sonra ▶️ **Başlat** butonuna bas.',
      '',
      `📋 _Seçili (${task.agents.length}): ${selectedText}_`,
    ].join('\n'),
    parseMode: 'Markdown',
  });
}

async function handleGenRunCallback(
  chatId: number,
  messageId: number,
): Promise<void> {
  const task = pendingGenerate.get(chatId);
  pendingGenerate.delete(chatId);

  if (!task || task.agents.length === 0) {
    await answerCallbackQuery({ callbackQueryId: '', text: '⚠️ Önce en az bir agent seç.' });
    return;
  }

  await answerCallbackQuery({ callbackQueryId: '', text: `${task.agents.length} agent zincirleme çalışıyor…` });

  const agents = task.agents.join(' + ');
  await sendMessage({
    chatId,
    text: `🔄 *${agents}* zincirleme çalışıyor:\n"${task.topic.slice(0, 60)}${task.topic.length > 60 ? '...' : ''}"`,
    parseMode: 'Markdown',
  });

  const { delegateToAgent } = await import('@/lib/agent/swarm');
  let context: Record<string, unknown> = {};
  const results: string[] = [];

  for (let i = 0; i < task.agents.length; i++) {
    const agentName = task.agents[i]!;
    try {
      const agentTask = i === 0
        ? task.topic
        : `${task.topic}\n\nÖnceki agent (${task.agents[i - 1]}) sonucu:\n${results[results.length - 1]?.slice(0, 1500)}`;

      const result = await delegateToAgent(agentName, agentTask, context, 5);
      results.push(result.result);

      // Sonraki agent'a context aktar
      context = { previous_agent: agentName, previous_result: result.result.slice(0, 2000) };
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ *${agentName}* hatası: ${err instanceof Error ? err.message.slice(0, 200) : 'Bilinmeyen hata'}\n\nZincir ${i + 1}/${task.agents.length} adımda kırıldı.`,
        parseMode: 'Markdown',
      });
      return;
    }
  }

  // Tüm sonuçları göster
  const summary = results.map((r, i) => `### ${i + 1}. ${task.agents[i]}\n${r.slice(0, 1500)}${r.length > 1500 ? '\n...' : ''}`).join('\n\n---\n\n');
  await sendMessage({
    chatId,
    text: summary.slice(0, 3900),
    parseMode: 'Markdown',
  });
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

  let currentTheme: ThemeId = 'dark_steel';
  try {
    const prefs = await getEmailPreferences();
    if (prefs.theme === 'dark_steel' || prefs.theme === 'light_steel' || prefs.theme === 'dark_gold') {
      currentTheme = prefs.theme;
    }
  } catch { /* use default */ }

  const state: WizardState = {
    chatId,
    step: 'theme',
    campaignType: 'outreach',
    theme: currentTheme,
    city: match,
    service: 'Logodesign, Webdesign, Druckdesign',
  };
  await setWizardState(chatId, state);

  await sendMessage({
    chatId,
    text: [
      `📧 ${match} için lokal outreach emaili`,
      '',
      `Mevcut tema: ${THEME_META[currentTheme].label}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[
        { text: '🎨 Tema Seç', callback_data: 'ew:goto:theme' },
        { text: '▶️ İleri', callback_data: 'ew:goto:portfolio' },
      ], [
        { text: '❌ İptal', callback_data: 'ew:cancel' },
      ]],
    },
  });
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

  let currentTheme: ThemeId = 'dark_steel';
  try {
    const prefs = await getEmailPreferences();
    if (prefs.theme === 'dark_steel' || prefs.theme === 'light_steel' || prefs.theme === 'dark_gold') {
      currentTheme = prefs.theme;
    }
  } catch { /* use default */ }

  let pastSubjects: string[] = [];
  try {
    const past = await getRecentCampaigns(10);
    pastSubjects = past.filter((c) => c.campaignType === 'reactivation').map((c) => c.subjectLine);
  } catch { /* ok */ }

  const state: WizardState = {
    chatId,
    step: 'concept',
    campaignType: 'reactivation',
    theme: currentTheme,
    recipientEmail: email,
    clientName: name,
    lastProject: project,
  };
  await setWizardState(chatId, state);

  await sendMessage({ chatId, text: '🤖 Reaktivasyon konseptleri oluşturuluyor...' });

  try {
    const concepts = await generateConcepts('reactivation', pastSubjects, {
      clientName: name,
      lastProject: project,
    });
    state.concepts = concepts;
    await setWizardState(chatId, state);

    const keyboard = concepts.map((c, i) => [
      { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
    ]);
    keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
    keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

    await sendMessage({
      chatId,
      text: [
        `📧 ${name} için Reaktivasyon Konseptleri`,
        '',
        ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
        '',
        'Bir konsept seç:',
      ].join('\n'),
      replyMarkup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    await clearWizardState(chatId);
    await sendMessage({
      chatId,
      text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
    });
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

  await sendMessage({ chatId, text: '🤖 AI email içeriği üretiliyor… (10-15 saniye)' });

  let aiContent: EmailContent;
  try {
    aiContent = await generateEmailContent(slots, week, year);
  } catch {
    await sendMessage({ chatId, text: '⚠️ AI içerik üretilemedi, standart şablonla devam ediliyor.' });
    aiContent = {
      digestIntro: '',
      portfolioIntro: '',
      portfolioItems: slotsToPortfolioItems(slots),
      closingText: '',
      subjectDigest: `Dein Weekly Digest | KW${week} — Fly & Froth`,
      subjectPortfolio: `Neue Design-Projekte | KW${week} — Fly & Froth Studio Update`,
    };
  }

  await sendMessage({
    chatId,
    text: [
      '📧 **AI Email Önizleme**',
      '',
      `📊 Digest konu: ${aiContent.subjectDigest}`,
      `🖼 Portfolyo konu: ${aiContent.subjectPortfolio}`,
      '',
      `Giriş: "${aiContent.digestIntro.slice(0, 150)}…"`,
      '',
      `${testEmail} adresine gönderiliyor…`,
    ].join('\n'),
  });

  try {
    // Digest
    const digestItems: DigestItem[] = slots.map((s) => ({
      topic: s.topic ?? '',
      pillar: s.pillar,
      channel: s.channel,
    }));
    const digestHtml = weeklyDigest(digestItems, week, year, aiContent.digestIntro);
    await sendEmail({
      to: [{ email: testEmail }],
      subject: aiContent.subjectDigest,
      htmlContent: digestHtml,
      tags: ['test', 'weekly-digest'],
    });

    // Portfolio
    if (aiContent.portfolioItems.length > 0) {
      const portfolioHtml = portfolioNewsletter(
        aiContent.portfolioItems,
        aiContent.portfolioIntro,
        aiContent.closingText,
      );
      await sendEmail({
        to: [{ email: testEmail }],
        subject: aiContent.subjectPortfolio,
        htmlContent: portfolioHtml,
        tags: ['test', 'portfolio'],
      });
    }

    await sendMessage({
      chatId,
      text: `✅ 2 test maili ${testEmail} adresine gönderildi.\n\n📊 Digest: "${aiContent.subjectDigest}"\n🖼 Portfolyo: "${aiContent.subjectPortfolio}"\n\nGelen kutunu kontrol et, onaylarsan "Listeye gönder"e tıkla.`,
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

  await sendMessage({ chatId, text: '🤖 AI email içeriği üretiliyor…' });

  let aiContent: EmailContent | undefined;
  try {
    aiContent = await generateEmailContent(slots, week, year);
  } catch { /* fallback to static templates */ }

  await sendMessage({ chatId, text: `📧 KW${week} email bülteni listeye gönderiliyor…` });

  try {
    const result = await runWeeklyEmailCampaign(listIds, slots, week, year, aiContent);
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

// ═══════════════════════════════════════════════════════════
// Email Wizard — Step Handlers
// ═══════════════════════════════════════════════════════════

async function handleEmailWizardCallback(
  chatId: number,
  messageId: number,
  data: string,
): Promise<void> {
  const state = await getWizardState(chatId);

  if (data === 'ew:cancel') {
    await clearWizardState(chatId);
    await editMessageText({
      chatId, messageId,
      text: '❌ Email kampanyası iptal edildi.',
      replyMarkup: undefined,
    });
    return;
  }

  if (!state) {
    await sendMessage({
      chatId,
      text: '⚠️ Oturum zaman aşımına uğradı. Lütfen /email-digest ile tekrar başlatın.',
    });
    return;
  }

  // Parse: ew:step:arg1:arg2:...
  const parts = data.split(':');
  const step = parts[1] ?? '';
  const rest = parts.slice(2);

  switch (step) {
    case 'concept':
      await handleWizardConcept(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
    case 'goto':
      await handleWizardGoto(chatId, messageId, state, rest[0] ?? '');
      break;
    case 'theme':
      await handleWizardTheme(chatId, messageId, state, rest[0] ?? '');
      break;
    case 'portfolio':
      await handleWizardPortfolio(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
    case 'content':
      await handleWizardContent(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
    case 'send':
      await handleWizardSend(chatId, messageId, state, rest[0] ?? '');
      break;
    default:
      await sendMessage({ chatId, text: `Bilinmeyen wizard adımı: ${step}` });
  }
}

// ── Concept Selection ──

async function handleWizardConcept(
  chatId: number, messageId: number, state: WizardState, sub: string, arg: string,
): Promise<void> {
  if (sub === 'pick' && state.concepts) {
    const idx = parseInt(arg, 10);
    const concept = state.concepts[idx];
    if (!concept) return;

    state.selectedConceptIndex = idx;
    state.subjectLine = concept.subjectLine;
    state.introText = concept.introText;
    state.closingText = concept.closingText;

    state.step = 'theme';
    await setWizardState(chatId, state);
    await showThemePicker(chatId, messageId, state);

  } else if (sub === 'regen') {
    await editMessageText({ chatId, messageId, text: '🤖 Yeni konseptler üretiliyor...', replyMarkup: undefined });

    let pastSubjects: string[] = [];
    try {
      const past = await getRecentCampaigns(10);
      pastSubjects = past.filter((c) => c.campaignType === state.campaignType).map((c) => c.subjectLine);
    } catch { /* ok */ }

    try {
      const concepts = await generateConcepts(
        state.campaignType,
        pastSubjects,
        state.clientName ? { clientName: state.clientName, lastProject: state.lastProject } : undefined,
      );
      state.concepts = concepts;
      state.selectedConceptIndex = undefined;
      await setWizardState(chatId, state);

      const keyboard = concepts.map((c, i) => [
        { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
      ]);
      keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
      keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

      await editMessageText({
        chatId, messageId,
        text: [
          '📧 Yeni Kampanya Konseptleri',
          '',
          ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
          '',
          'Bir konsept seç:',
        ].join('\n'),
        replyMarkup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

// ── Navigation ──

async function handleWizardGoto(
  chatId: number, messageId: number, state: WizardState, target: string,
): Promise<void> {
  if (target === 'theme') {
    state.step = 'theme';
    await setWizardState(chatId, state);
    await showThemePicker(chatId, messageId, state);
  } else if (target === 'portfolio') {
    state.step = 'portfolio';
    await setWizardState(chatId, state);
    await showPortfolioPicker(chatId, messageId, state);
  } else if (target === 'content') {
    // If concept data is available, go straight to preview
    if (state.selectedConceptIndex !== undefined && state.concepts) {
      state.step = 'content';
      await setWizardState(chatId, state);
      await showContentPreview(chatId, messageId, state);
      return;
    }
    await editMessageText({ chatId, messageId, text: '🤖 İçerik oluşturuluyor...', replyMarkup: undefined });
    try {
      await generateAndShowContent(chatId, messageId, state);
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ İçerik oluşturulamadı: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

// ── Theme Selection ──

async function showThemePicker(chatId: number, messageId: number, state: WizardState): Promise<void> {
  const themeIds: ThemeId[] = ['dark_steel', 'light_steel', 'dark_gold'];
  const keyboard = themeIds.map((id) => {
    const meta = THEME_META[id];
    const checked = state.theme === id ? '✅ ' : '☐ ';
    return [{ text: `${checked}${meta.label}`, callback_data: `ew:theme:${id}` }];
  });

  keyboard.push([
    { text: '◀️ Geri', callback_data: 'ew:goto:theme' },
    { text: '▶️ İleri', callback_data: 'ew:goto:portfolio' },
  ]);
  keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

  const currentMeta = THEME_META[state.theme];
  await editMessageText({
    chatId, messageId,
    text: [
      '🎨 Email teması seçin:',
      '',
      `Seçili: ${currentMeta.label}`,
      `Açıklama: ${currentMeta.description}`,
    ].join('\n'),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardTheme(
  chatId: number, messageId: number, state: WizardState, themeId: string,
): Promise<void> {
  if (!THEME_META[themeId as ThemeId]) return;
  state.theme = themeId as ThemeId;
  await setWizardState(chatId, state);
  await updateEmailPreferences(themeId as ThemeId).catch(() => {});
  await showThemePicker(chatId, messageId, state);
}

// ── Portfolio Selection (digest only) ──

async function showPortfolioPicker(chatId: number, messageId: number, state: WizardState): Promise<void> {
  if (state.campaignType !== 'digest' || !state.planId) {
    await handleWizardGoto(chatId, messageId, state, 'content');
    return;
  }

  if (!state.portfolioItems) {
    const slots = await getSlotsByPlan(state.planId);
    const portfolioSlots = slots.filter(
      (s) => s.status === 'pending' && s.topic && (s.pillar === 'vitrine' || s.pillar === 'reel'),
    );

    const serviceMap: Record<string, string> = {
      webdesign: 'Webdesign', website: 'Webdesign',
      logodesign: 'Logodesign', logo: 'Logodesign',
      flyerdesign: 'Flyerdesign', flyer: 'Flyerdesign',
      druckdesign: 'Druckdesign', branding: 'Branding',
    };

    state.portfolioItems = portfolioSlots.slice(0, 6).map((s, i) => {
      const topic = (s.topic ?? '').toLowerCase();
      let serviceType = 'Design Service';
      for (const [key, label] of Object.entries(serviceMap)) {
        if (topic.includes(key)) { serviceType = label; break; }
      }
      if (s.pillar === 'reel') serviceType = 'Video';
      return {
        index: i,
        topic: s.topic ?? 'Neues Projekt',
        pillar: s.pillar,
        headline: s.topic ?? 'Neues Projekt',
        description: 'Ein Design-Projekt aus Karben, Rhein-Main.',
        cta: s.pillar === 'reel' ? 'Reel ansehen' : 'Projekt ansehen',
        serviceType,
        selected: true,
      };
    });
    await setWizardState(chatId, state);
  }

  const keyboard = (state.portfolioItems ?? []).map((item) => {
    const prefix = item.selected ? '✅' : '☐';
    return [{ text: `${prefix} ${item.serviceType} — ${item.topic.slice(0, 25)}`, callback_data: `ew:portfolio:toggle:${item.index}` }];
  });

  keyboard.push([
    { text: '◀️ Geri', callback_data: 'ew:goto:theme' },
    { text: '▶️ İleri', callback_data: 'ew:goto:content' },
  ]);
  keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

  const selectedCount = (state.portfolioItems ?? []).filter((p) => p.selected).length;
  await editMessageText({
    chatId, messageId,
    text: [
      '🖼 Bültende yer alacak projeler:',
      '',
      ...(state.portfolioItems ?? []).map((item) =>
        `${item.selected ? '✅' : '☐'} ${item.serviceType} — ${item.topic}`,
      ),
      '',
      `${selectedCount} proje seçildi.`,
    ].join('\n'),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardPortfolio(
  chatId: number, messageId: number, state: WizardState, sub: string, indexStr: string,
): Promise<void> {
  if (sub === 'toggle' && state.portfolioItems) {
    const idx = parseInt(indexStr, 10);
    const item = state.portfolioItems[idx];
    if (item) {
      item.selected = !item.selected;
      await setWizardState(chatId, state);
    }
    await showPortfolioPicker(chatId, messageId, state);
  }
}

// ── Content Preview + Editing ──

async function generateAndShowContent(chatId: number, messageId: number, state: WizardState): Promise<void> {
  if (state.campaignType === 'digest' && state.portfolioItems) {
    const selected = state.portfolioItems.filter((p) => p.selected);
    const plan = state.planId ? await getPlan(state.planId) : null;
    const result = await generateDigestContent(selected, state.theme, plan?.calendar_week);
    state.subjectLine = result.subjectLine;
    state.introText = result.introText;
    state.closingText = result.closingText;
    state.portfolioItems = result.portfolioItems;
  } else if (state.campaignType === 'outreach' && state.city && state.service) {
    const result = await generateOutreachContent(state.city, state.service, state.theme);
    state.subjectLine = result.subjectLine;
    state.introText = `${result.headline}\n\n${result.bodyText}`;
    state.closingText = result.ctaLabel;
  } else if (state.campaignType === 'reactivation' && state.clientName && state.lastProject) {
    const result = await generateReactivationContent(state.clientName, state.lastProject, state.theme);
    state.subjectLine = result.subjectLine;
    state.introText = result.bodyText;
    state.closingText = 'Neues Projekt starten';
  }

  state.step = 'content';
  await setWizardState(chatId, state);
  await showContentPreview(chatId, messageId, state);
}

async function showContentPreview(chatId: number, messageId: number, state: WizardState): Promise<void> {
  const portfolioSection = state.portfolioItems
    ? state.portfolioItems.filter((p) => p.selected).map((p, i) =>
        `${i + 1}. ${p.headline}`
      ).join('\n')
    : '';

  const text = [
    `📧 Email İçeriği — ${THEME_META[state.theme].label} teması`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `📌 KONU:`,
    `"${(state.subjectLine ?? '').slice(0, 80)}"`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `📝 İÇERİK:`,
    (state.introText ?? '').slice(0, 300),
    '',
    portfolioSection ? '━━━━━━━━━━━━━━━━━━' : '',
    portfolioSection ? `🖼 PORTFOLYO:` : '',
    portfolioSection,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `🔚 KAPANIŞ:`,
    (state.closingText ?? '').slice(0, 150),
  ].filter(Boolean).join('\n');

  const keyboard = [
    [
      { text: '✏️ Konu', callback_data: 'ew:content:edit:subject' },
      { text: '✏️ İçerik', callback_data: 'ew:content:edit:intro' },
    ],
    [
      { text: '✏️ Kapanış', callback_data: 'ew:content:edit:closing' },
    ],
    [
      { text: '📩 Test Gönder', callback_data: 'ew:send:test' },
      { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
    ],
    [
      { text: '◀️ Geri', callback_data: 'ew:goto:portfolio' },
      { text: '❌ İptal', callback_data: 'ew:cancel' },
    ],
  ];

  await editMessageText({
    chatId, messageId,
    text: text.slice(0, 4096),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardContent(
  chatId: number, messageId: number, state: WizardState, sub: string, field: string,
): Promise<void> {
  if (sub === 'edit') {
    await setWizardState(chatId, state);

    const fieldLabels: Record<string, string> = {
      subject: 'konu satırını',
      intro: 'giriş metnini',
      closing: 'kapanış metnini',
    };

    // Store edit field in a transient property
    (state as any)._editingField = field;
    await setWizardState(chatId, state);

    const currentValue = field === 'subject' ? state.subjectLine :
      field === 'intro' ? state.introText : state.closingText;

    await editMessageText({
      chatId, messageId,
      text: [
        `✏️ ${fieldLabels[field] ?? field} düzenle:`,
        '',
        'Yeni metni doğrudan yazabilir veya bir düzeltme talimatı verebilirsin.',
        'Örnek: "daha kısa olsun" veya "vurguyu logo tasarımına yap"',
        '',
        `Şu anki: ${(currentValue ?? '').slice(0, 300)}`,
      ].join('\n').slice(0, 4096),
      replyMarkup: { inline_keyboard: [[
        { text: '↩️ Vazgeç', callback_data: 'ew:content:preview' },
      ]]},
    });
  } else if (sub === 'preview') {
    state.step = 'content';
    await setWizardState(chatId, state);
    await showContentPreview(chatId, messageId, state);
  }
}

// Handle text input for editing (called from handleCommand when wizard is in edit mode)
async function handleWizardEditInput(chatId: number, text: string): Promise<void> {
  const state = await getWizardState(chatId);
  if (!state || state.step !== 'content') return;

  const field = (state as any)._editingField as string | undefined;
  if (!field) return;

  delete (state as any)._editingField;

  const instruction = text.trim();

  const isDirectReplacement =
    instruction.length > 50 ||
    !/\b(daha|biraz|kısa|uzun|vurgu|ekle|çıkar|değiştir|olsun|yap)\b/i.test(instruction);

  if (isDirectReplacement) {
    if (field === 'subject') state.subjectLine = instruction;
    else if (field === 'intro') state.introText = instruction;
    else if (field === 'closing') state.closingText = instruction;
  } else {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const existing = field === 'subject' ? state.subjectLine :
                     field === 'intro' ? state.introText :
                     state.closingText;
    try {
      const revised = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: 'Revise the given text according to the instruction. Return ONLY the revised text, no quotes, no explanation.',
        messages: [{
          role: 'user',
          content: `Original text:\n"${existing}"\n\nInstruction: ${instruction}\n\nRevised text:`,
        }],
      }).then((r) => {
        const block = r.content[0];
        return block && block.type === 'text' ? block.text.trim() : existing;
      });

      if (field === 'subject') state.subjectLine = revised!;
      else if (field === 'intro') state.introText = revised!;
      else if (field === 'closing') state.closingText = revised!;
    } catch {
      // AI failed, keep old text
    }
  }

  await setWizardState(chatId, state);
  await sendMessage({ chatId, text: '✅ Metin güncellendi. Güncel önizleme:' });
  await showContentPreviewNew(chatId, state);
}

async function showContentPreviewNew(chatId: number, state: WizardState): Promise<void> {
  const portfolioSection = state.portfolioItems
    ? state.portfolioItems.filter((p) => p.selected).map((p, i) =>
        `${i + 1}. ${p.headline}`
      ).join('\n')
    : '';

  const text = [
    `📧 Email İçeriği — ${THEME_META[state.theme].label} teması`,
    '',
    `📌 KONU: "${(state.subjectLine ?? '').slice(0, 80)}"`,
    `📝 İÇERİK: ${(state.introText ?? '').slice(0, 200)}`,
    portfolioSection ? `🖼 PORTFOLYO:\n${portfolioSection}` : '',
    `🔚 KAPANIŞ: ${(state.closingText ?? '').slice(0, 100)}`,
  ].filter(Boolean).join('\n');

  const keyboard = [
    [
      { text: '✏️ Konu', callback_data: 'ew:content:edit:subject' },
      { text: '✏️ İçerik', callback_data: 'ew:content:edit:intro' },
      { text: '✏️ Kapanış', callback_data: 'ew:content:edit:closing' },
    ],
    [
      { text: '📩 Test Gönder', callback_data: 'ew:send:test' },
      { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
    ],
    [
      { text: '◀️ Geri', callback_data: 'ew:goto:portfolio' },
      { text: '❌ İptal', callback_data: 'ew:cancel' },
    ],
  ];

  await sendMessage({
    chatId,
    text: text.slice(0, 4096),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

// ── Send Handlers ──

async function handleWizardSend(
  chatId: number, messageId: number, state: WizardState, mode: string,
): Promise<void> {
  if (mode === 'test') {
    await editMessageText({ chatId, messageId, text: '📤 Test email gönderiliyor...', replyMarkup: undefined });

    try {
      const html = buildEmailHtml(state);
      await sendEmail({
        to: [{ email: 'info@fly-froth.com', name: 'Fly & Froth' }],
        subject: state.subjectLine ?? 'Fly & Froth Newsletter',
        htmlContent: html,
      });

      await sendMessage({
        chatId,
        text: '✅ Test email gönderildi! info@fly-froth.com adresini kontrol et.',
        replyMarkup: {
          inline_keyboard: [[
            { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
            { text: '↩️ Düzenle', callback_data: 'ew:content:preview' },
          ]],
        },
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Test gönderimi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else if (mode === 'list') {
    const listIds = emailListIds();
    if (listIds.length === 0) {
      await sendMessage({
        chatId,
        text: '⚠️ BREVO_LIST_IDS env değişkeni ayarlanmamış. Önce Vercel ortam değişkenlerine ekleyin.',
      });
      return;
    }

    await editMessageText({
      chatId, messageId,
      text: [
        `📤 "${state.subjectLine}" konulu email`,
        `${listIds.length} listeye gönderilsin mi?`,
        '',
        'Bu işlem geri alınamaz.',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [[
          { text: '✅ Onayla ve Gönder', callback_data: 'ew:send:confirm' },
          { text: '❌ İptal', callback_data: 'ew:content:preview' },
        ]],
      },
    });
  } else if (mode === 'confirm') {
    await editMessageText({ chatId, messageId, text: '📤 Kampanya oluşturuluyor ve gönderiliyor...', replyMarkup: undefined });

    try {
      const html = buildEmailHtml(state);
      const listIds = emailListIds();

      const campaign = await createCampaign({
        name: `FW Newsletter — ${new Date().toISOString().slice(0, 10)}`,
        subject: state.subjectLine ?? 'Fly & Froth Newsletter',
        htmlContent: html,
        listIds,
      });

      await sendCampaignNow(campaign.id);

      // Save to campaign history for dedup
      try {
        await saveCampaign({
          subjectLine: state.subjectLine ?? '',
          conceptTitle: state.concepts?.[state.selectedConceptIndex ?? 0]?.title ?? 'Manuel',
          campaignType: state.campaignType,
          theme: state.theme,
          contentJson: {
            introText: state.introText,
            closingText: state.closingText,
            portfolioItems: state.portfolioItems?.map((p) => ({
              headline: p.headline,
              description: p.description,
              serviceType: p.serviceType,
            })),
          },
          brevoCampaignId: campaign.id,
          recipientEmail: state.recipientEmail,
        });
      } catch { /* non-critical */ }

      await clearWizardState(chatId);
      await sendMessage({
        chatId,
        text: [
          '✅ Email kampanyası gönderildi!',
          `Campaign ID: ${campaign.id}`,
          'Brevo panelinden performansı takip edebilirsin.',
        ].join('\n'),
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Kampanya gönderimi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

function buildEmailHtml(state: WizardState): string {
  if (state.campaignType === 'digest') {
    const items = (state.portfolioItems ?? [])
      .filter((p) => p.selected)
      .map((p) => ({
        headline: p.headline,
        description: p.description,
        cta: p.cta,
        serviceType: p.serviceType,
      }));
    return renderPortfolioNewsletter(items as any, state.theme, state.introText, state.closingText);
  }

  return renderTheme(state.theme, {
    headline: state.campaignType === 'outreach'
      ? `Design-Service für ${state.city ?? 'Ihre Stadt'}`
      : `Wieder von dir hören!`,
    introHtml: state.introText ?? '',
    sections: [],
    closingHtml: state.closingText ?? '',
    ctaLabel: state.campaignType === 'outreach' ? 'Jetzt anfragen' : 'Neues Projekt starten',
    ctaUrl: 'https://fly-froth.com/kontakt',
  });
}

async function handleChatCommand(chatId: number, text: string): Promise<void> {
  const message = text.replace(/^\/chat(@\w+)?\s*/, '').trim();
  if (!message) {
    await sendMessage({
      chatId,
      text:
        '💬 **Fly & Froth AI Asistan**\n\n' +
        'Bana istediğini sorabilir, yapmamı istediğin işleri söyleyebilirsin.\n\n' +
        'Örnekler:\n' +
        '• "Bu hafta kaç fatura kestik?"\n' +
        '• "Son 3 Kleinanzeigen mesajını kontrol et"\n' +
        '• "Yarın için bir Instagram postu oluştur"\n' +
        '• "Müşteri listesini göster"\n' +
        '• "Flyer tasarla: yaz indirimi %50"\n' +
        '• "Sistem durumu nedir?"\n\n' +
        'Direkt mesaj da yazabilirsin, /chat yazmana gerek yok.\n' +
        '/chat\\_yeni — yeni sohbet başlat.',
      parseMode: 'Markdown',
    });
    return;
  }
  const sent = await sendMessage({ chatId, text: '🤔 Düşünüyorum...' });
  try {
    await runAgentTurn(chatId, message, sent.message_id);
  } catch (err) {
    console.error('[agent] chat command error:', err);
    await sendMessage({
      chatId,
      text: `Hata: ${err instanceof Error ? err.message.slice(0, 200) : 'Bilinmeyen hata'}`,
    }).catch(() => {});
  }
}

async function handleCommand(
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  const trimmed = text.trim();

  // Intercept: wizard content editing
  const wizardState = await getWizardState(chatId);
  if (wizardState && wizardState.step === 'content' && (wizardState as any)._editingField) {
    await handleWizardEditInput(chatId, trimmed);
    return;
  }

  if (trimmed === '/start') {
    await sendMessage({ chatId, text: START_TEXT });
    return;
  }
  if (trimmed === '/help') {
    await sendMessage({ chatId, text: HELP_TEXT });
    return;
  }

  if (trimmed === '/chat' || trimmed.startsWith('/chat ')) {
    await handleChatCommand(chatId, trimmed);
    return;
  }
  if (trimmed === '/chat-yeni' || trimmed === '/chat_yeni') {
    clearAgentSession(chatId);
    await sendMessage({ chatId, text: '💬 Yeni sohbet başlatıldı. Önceki konuşma silindi.' });
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

  // ── Kill switch — sistem genel durdur/başlat ──
  if (trimmed === '/durdur' || trimmed === '/pause' || trimmed === '/stop') {
    const { setSystemPaused, getPauseMeta } = await import('@/lib/system/kill-switch');
    const before = await getPauseMeta();
    if (before.paused) {
      await sendMessage({
        chatId,
        text: `⏸ Sistem zaten durmuş.\nDeğişim: ${before.changed_at ?? '—'} (${before.changed_by ?? '—'})\n\nBaşlatmak için: /baslat`,
      });
      return;
    }
    await setSystemPaused(true, `tg:${chatId}`);
    await sendMessage({
      chatId,
      text: [
        '⏸ Sistem durduruldu.',
        '',
        'Etkilenen cron\'lar:',
        '• trend-discovery (planner)',
        '• trend-discovery-poster',
        '• social-daily-digest',
        '',
        'Çalışmaya devam eden:',
        '• Telegram webhook (sen kontrol edebilesin)',
        '• Cart abandon followup',
        '• Reviews ask',
        '• Stripe webhook (satışları kabul eder)',
        '',
        'Başlatmak için: /baslat',
        'Durumu görmek için: /durum',
      ].join('\n'),
    });
    return;
  }

  if (trimmed === '/baslat' || trimmed === '/resume' || trimmed === '/start_system') {
    const { setSystemPaused, getPauseMeta } = await import('@/lib/system/kill-switch');
    const before = await getPauseMeta();
    if (!before.paused) {
      await sendMessage({
        chatId,
        text: `▶️ Sistem zaten çalışıyor.\nSon değişim: ${before.changed_at ?? '—'} (${before.changed_by ?? '—'})`,
      });
      return;
    }
    await setSystemPaused(false, `tg:${chatId}`);
    await sendMessage({
      chatId,
      text: [
        '▶️ Sistem başlatıldı.',
        '',
        'Cron\'lar normal şekilde çalışacak:',
        '• Trend keşfi (planner+poster)',
        '• Sosyal medya yayınları (2 post + 2 story / gün)',
        '',
        'Durdurmak için: /durdur',
        'Durumu görmek için: /durum',
      ].join('\n'),
    });
    return;
  }

  // ── Sprint K Faz 6 Parça B — Apparel approval komutları ──
  if (trimmed === '/candidates' || trimmed === '/candidate' || trimmed === '/apparel') {
    await handleApparelListCommand(chatId);
    return;
  }
  if (/^\/approve_[a-f0-9]+$/i.test(trimmed)) {
    const shortId = trimmed.slice('/approve_'.length).toLowerCase();
    await handleApparelApproveCommand(chatId, shortId);
    return;
  }
  if (/^\/reject_[a-f0-9]+$/i.test(trimmed)) {
    const shortId = trimmed.slice('/reject_'.length).toLowerCase();
    await handleApparelRejectCommand(chatId, shortId);
    return;
  }

  if (trimmed === '/durum' || trimmed === '/status') {
    const { getPauseMeta } = await import('@/lib/system/kill-switch');
    const meta = await getPauseMeta();
    const stateEmoji = meta.paused ? '⏸ Durduruldu' : '▶️ Çalışıyor';
    await sendMessage({
      chatId,
      text: [
        `Sistem durumu: ${stateEmoji}`,
        '',
        meta.changed_at ? `Son değişim: ${meta.changed_at}` : '',
        meta.changed_by ? `Değiştiren: ${meta.changed_by}` : '',
        '',
        meta.paused ? 'Başlatmak için: /baslat' : 'Durdurmak için: /durdur',
      ].filter(Boolean).join('\n'),
    });
    return;
  }

  if (trimmed === '/generate' || trimmed.startsWith('/generate ')) {
    const topic = trimmed === '/generate' ? '' : trimmed.slice('/generate'.length).trim();
    await handleGenerateCommand(chatId, messageId, topic);
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

  if (trimmed.startsWith('/ads')) {
    await handleAdsCommand(chatId, trimmed);
    return;
  }

  if (trimmed === '/faturasil') {
    await handleDeleteAllInvoices(chatId);
    return;
  }

  if (trimmed.startsWith('/fatura')) {
    await handleFaturaCommand(chatId);
    return;
  }

  if (trimmed === '/angebot') {
    await handleAngebotCommand(chatId);
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

  if (trimmed.startsWith('/liste')) {
    const rest = trimmed.replace(/^\/liste(@\w+)?\s*/, '').trim();
    if (rest.toLowerCase().startsWith('ekle ')) {
      await handleListeEkleCommand(chatId, rest.slice(5).trim());
    } else {
      await sendMessage({ chatId, text: '📋 Kullanım:\n/liste ekle <email> [isim]\nÖrnek: /liste ekle ahmet@ornek.com Ahmet Yılmaz' });
    }
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

  // Active text-edit session: user is manually editing a post caption
  if (textEditSessions.has(chatId)) {
    const handled = await handleEditTextInput(chatId, trimmed);
    if (handled) return;
  }

  // Trend engine: reject reason capture
  if (trendRejectSessions.has(chatId)) {
    const handled = await handleTrendRejectInput(chatId, trimmed);
    if (handled) return;
  }

  // Trend engine: shop title edit capture
  if (trendEditTitleSessions.has(chatId)) {
    const handled = await handleTrendEditTitleInput(chatId, trimmed);
    if (handled) return;
  }

  // Active plan-edit session: user is selecting a slot by number
  const planId = planEditSessions.get(chatId);
  if (planId) {
    if (trimmed.toLowerCase() === 'iptal') {
      planEditSessions.delete(chatId);
      await handlePlanView(chatId, planId);
      return;
    }
    const slotNum = parseInt(trimmed, 10);
    if (!isNaN(slotNum) && slotNum >= 1) {
      planEditSessions.delete(chatId);
      const slots = await getSlotsByPlan(planId);
      const slot = slots[slotNum - 1];
      if (!slot) {
        await sendMessage({ chatId, text: `1-${slots.length} arası bir sayı yaz.` });
        planEditSessions.set(chatId, planId);
        return;
      }
      const day = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][slot.day_of_week] ?? '??';
      await sendMessage({
        chatId,
        text: [
          `✏️ **Slot ${slotNum}**`,
          `${day} ${slot.time_slot} [${slot.pillar}]`,
          `Konu: ${slot.topic ?? '(yok)'}`,
          `Durum: ${slot.status}${slot.post_id ? ` (post: ${slot.post_id})` : ''}`,
        ].join('\n'),
        replyMarkup: slotEditKeyboard(slot.id, planId),
      });
      return;
    }
    await sendMessage({ chatId, text: 'Geçerli bir slot numarası yaz veya "iptal".' });
    return;
  }

  // Active Kleinanzeigen thread awaiting text input takes priority.
  const activeKz = await getActiveKleinanzeigenThread(chatId);
  if (activeKz) {
    await handleKzTextInput(chatId, activeKz, trimmed);
    return;
  }

  // Active invoice/angebot draft: drive the multi-step state machine first.
  const activeInvoice = await getActiveInvoiceDraft(chatId);
  if (activeInvoice && activeInvoice.status === 'collecting') {
    if (activeInvoice.type === 'angebot') {
      const handled = await handleAngebotText(chatId, activeInvoice, trimmed);
      if (handled) return;
    } else {
      const handled = await handleInvoiceText(chatId, activeInvoice, trimmed);
      if (handled) return;
    }
  }

  // Active ads draft: drive the URL / budget collection steps.
  {
    const activeAdsDraft = await getActiveAdsDraft(chatId);
    if (activeAdsDraft && activeAdsDraft.status === 'collecting') {
      await handleAdsTextInput(chatId, activeAdsDraft, trimmed);
      return;
    }
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
      const invId = activeDraft.instruction.split(':')[1];
      const updated = await updateDraft(activeDraft.id, {
        to_email: recipientEmail,
        instruction: invId ? `__FROM_INVOICE__:${invId}` : '',
        status: 'drafting',
      });

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
    if (activeDraft.instruction.startsWith('__ANGEBOT_PENDING__:')) {
      const looksLikeEmail = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(trimmed);
      if (!looksLikeEmail) {
        await sendMessage({
          chatId,
          text: '⚠️ Geçerli bir email adresi yaz (sadece adres):',
        });
        return;
      }
      const recipientEmail = trimmed.trim();
      const angebotId = activeDraft.instruction.split(':')[1];
      const updated = await updateDraft(activeDraft.id, {
        to_email: recipientEmail,
        instruction: angebotId ? `__FROM_ANGEBOT__:${angebotId}` : '',
        status: 'drafting',
      });

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

  // ── AI Assistant fallback ──
  const sent = await sendMessage({ chatId, text: '🤔 ...' });
  try {
    await runAgentTurn(chatId, trimmed, sent.message_id);
  } catch (err) {
    console.error('[agent] fallback error:', err);
    await sendMessage({
      chatId,
      text: `Asistan hatasi: ${err instanceof Error ? err.message.slice(0, 200) : 'Bilinmeyen hata'}`,
    }).catch(() => {});
  }
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

  // Email wizard callbacks use a different format: ew:step:sub:...
  if (data.startsWith('ew:')) {
    await handleEmailWizardCallback(chatId, messageId, data);
    return;
  }

  const [action, postId, ...rest] = data.split(':');

  try {
    if (action === 'approve' && postId) {
      await handleApprove(chatId, messageId, postId, false);
    } else if (action === 'approve_story' && postId) {
      await handleApprove(chatId, messageId, postId, true);
    } else if (action === 'schedule' && postId) {
      await handleSchedule(chatId, messageId, postId, false);
    } else if (action === 'schedule_story' && postId) {
      await handleSchedule(chatId, messageId, postId, true);
    } else if (action === 'regen_image' && postId) {
      await handleRegenImage(chatId, postId);
    } else if (action === 'regen_text' && postId) {
      await handleRegenText(chatId, postId);
    } else if (action === 'edit_text' && postId) {
      await handleEditText(chatId, postId);
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
    } else if (action === 'mail_translate' && postId) {
      await handleMailTranslate(chatId, postId, query.id);
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
    } else if ((action === 'inv_item_more' || action === 'ang_item_more') && postId) {
      const d = await getInvoice(postId);
      if (d?.type === 'angebot') {
        await handleAngebotItemMore(chatId, postId);
      } else {
        await handleInvoiceItemMore(chatId, postId);
      }
    } else if ((action === 'inv_no_more_items' || action === 'ang_no_more_items') && postId) {
      const d = await getInvoice(postId);
      if (d?.type === 'angebot') {
        await handleAngebotNoMoreItems(chatId, postId);
      } else {
        await handleInvoiceNoMoreItems(chatId, postId);
      }
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
    } else if (action === 'ang_fp' && postId) {
      const key = rest[0] ?? '';
      await handleAngebotFooterPreset(chatId, postId, key);
    } else if (action === 'ang_footer_manual' && postId) {
      await handleAngebotFooterManual(chatId, postId);
    } else if (action === 'ang_footer_skip' && postId) {
      await handleAngebotFooterSkip(chatId, postId);
    } else if (action === 'ang_number_auto' && postId) {
      await handleAngebotNumberAuto(chatId, postId);
    } else if (action === 'ang_number_manual' && postId) {
      await handleAngebotNumberManual(chatId, postId);
    } else if (action === 'ang_save' && postId) {
      await handleAngebotSave(chatId, postId);
    } else if (action === 'ang_restart') {
      await handleAngebotRestart(chatId);
    } else if (action === 'ang_delete' && postId) {
      await handleAngebotDelete(chatId, postId);
    } else if (action === 'ang_send_mail' && postId) {
      await handleAngebotSendMail(chatId, postId);
    } else if (action === 'ang_convert' && postId) {
      await handleAngebotConvert(chatId, postId);
    } else if (action === 'ang_add_item' && postId) {
      await handleAngebotAddItem(chatId, postId);
    } else if (action === 'ang_remove_item' && postId) {
      await handleAngebotRemoveItem(chatId, postId);
    } else if (action === 'ang_item_remove' && postId) {
      await handleAngebotItemRemove(chatId, postId, parseInt(rest[0] ?? '0', 10));
    } else if (action === 'ang_back' && postId) {
      await handleAngebotBack(chatId, postId);
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
    } else if (action === 'gen_agent' && postId) {
      await handleGenAgentCallback(chatId, messageId, postId);
    } else if (action === 'gen_run') {
      await handleGenRunCallback(chatId, messageId);
    } else if (action === 'brevo_add') {
      await handleBrevoAddCallback(chatId, messageId, postId ?? '');
    } else if (action === 'ads_type' && postId) {
      const typeStr = rest[0];
      const draft = await getAdsDraft(postId);
      if (!draft || draft.status !== 'collecting') {
        await answerCallbackQuery({ callbackQueryId: query.id, text: 'Taslak aktif değil.' });
        return;
      }
      await updateAdsDraft(postId, {
        draft_payload: { ...draft.draft_payload, type: typeStr as AdsCampaignType },
        current_step: 'target',
      });
      await answerCallbackQuery({ callbackQueryId: query.id });
      await sendMessage({
        chatId,
        text: '🔗 Adım 2/4: Hedef URL gönder (örn. https://fly-froth.com/visitenkarten).',
        replyMarkup: adsCancelKeyboard(postId),
      });
      await sendMessage({
        chatId,
        text: '🎯 Dönüşüm hedefini de seç:',
        replyMarkup: conversionGoalKeyboard(postId),
      });
    } else if (action === 'ads_goal' && postId) {
      const goal = rest[0];
      const draft = await getAdsDraft(postId);
      if (!draft) {
        await answerCallbackQuery({ callbackQueryId: query.id, text: 'Taslak yok.' });
        return;
      }
      await updateAdsDraft(postId, {
        draft_payload: {
          ...draft.draft_payload,
          conversion_action: goal === 'none' ? undefined : goal!,
        },
      });
      await answerCallbackQuery({ callbackQueryId: query.id, text: `Hedef: ${goal}` });
    } else if (action === 'ads_cancel' && postId) {
      await updateAdsDraft(postId, { status: 'cancelled' });
      await answerCallbackQuery({ callbackQueryId: query.id, text: 'İptal edildi.' });
      await sendMessage({ chatId, text: '🛑 Kampanya sihirbazı iptal edildi.' });
    } else if (action === 'ads_regen' && postId) {
      await answerCallbackQuery({ callbackQueryId: query.id });
      await sendMessage({ chatId, text: '🔄 Yeniden üretiyorum…' });
      await runAdsGeneration(chatId, postId);
    } else if (action === 'ads_approve' && postId) {
      const draft = await getAdsDraft(postId);
      if (!draft || draft.status !== 'awaiting_approval') {
        await answerCallbackQuery({ callbackQueryId: query.id, text: 'Onay için uygun durumda değil.' });
        return;
      }
      await answerCallbackQuery({ callbackQueryId: query.id, text: 'Oluşturuluyor…' });
      const p = draft.draft_payload;
      if (
        !p.type ||
        !p.target_url ||
        !p.daily_budget_cents ||
        !p.start_date ||
        !draft.generated_copy ||
        !draft.generated_keywords
      ) {
        await sendMessage({ chatId, text: '❌ Taslak eksik. /ads new ile yeniden başla.' });
        return;
      }
      if (p.type !== 'search') {
        await sendMessage({ chatId, text: `❌ Phase 1 yalnız Search destekliyor. Tip: ${p.type}` });
        return;
      }
      const prefs = await getAdsPreferences();
      try {
        const result = await createSearchCampaign(
          {
            type: 'search',
            name: p.campaign_name ?? `${p.type} - ${p.start_date}`,
            target_url: p.target_url,
            conversion_action: p.conversion_action ?? null,
            daily_budget_cents: p.daily_budget_cents,
            start_date: p.start_date,
            end_date: p.end_date ?? null,
            language_code: prefs.default_language_code,
            location_id: prefs.default_location_id,
            headlines: draft.generated_copy.headlines,
            descriptions: draft.generated_copy.descriptions,
            keywords: draft.generated_keywords.map((k) => ({
              keyword: k.keyword,
              match_type: k.match_type,
            })),
          },
          chatId,
        );
        await updateAdsDraft(postId, { status: 'confirmed', sent_at: new Date() });
        await sendMessage({
          chatId,
          text: `✅ Kampanya oluşturuldu (paused).\nGoogle ID: ${result.google_campaign_id}\n/ads resume <id> ile başlat.`,
        });
      } catch (err) {
        await updateAdsDraft(postId, {
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        await notifyError(chatId, err);
      }
    } else if (action === 'trend_approve' && postId) {
      await handleTrendApprove(chatId, messageId, postId);
    } else if (action === 'trend_reject' && postId) {
      await handleTrendReject(chatId, postId);
    } else if (action === 'trend_regen_visual' && postId) {
      await handleTrendRegenVisual(chatId, messageId, postId);
    } else if (action === 'trend_edit_title' && postId) {
      await handleTrendEditTitle(chatId, postId);
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

  // BUG FIX — Telegram retry guard (/post duplicate trigger fix)
  if (typeof update.update_id === 'number' && isDuplicateUpdate(update.update_id)) {
    console.log(`[webhook] duplicate update_id=${update.update_id}, skipping`);
    return NextResponse.json({ ok: true, deduped: true });
  }

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
    const caption = update.message.caption?.trim() ?? '';
    if (caption.startsWith('/raw')) {
      await handlePhotoMessage(update.message);
    } else {
      // Route to AI assistant with vision
      const largest = update.message.photo[update.message.photo.length - 1]!;
      try {
        const fileInfo = await getFile(largest.file_id);
        if (fileInfo.file_path) {
          const buffer = await downloadFile(fileInfo.file_path);
          const base64 = buffer.toString('base64');
          const sent = await sendMessage({ chatId, text: '🤔 Gorsel analiz ediliyor...' });
          try {
            await runAgentTurn(chatId, caption || 'Bu gorseli analiz et.', sent.message_id, {
              data: base64,
              media_type: 'image/jpeg',
            });
          } catch (err) {
            console.error('[agent] vision error:', err);
            await sendMessage({
              chatId,
              text: `Gorsel analiz hatasi: ${err instanceof Error ? err.message.slice(0, 200) : 'Bilinmeyen hata'}`,
            }).catch(() => {});
          }
        } else {
          await sendMessage({ chatId, text: '⚠️ Görsel indirilemedi.' });
        }
      } catch (err) {
        console.error('[agent] photo download error:', err);
        await sendMessage({ chatId, text: '⚠️ Görsel işlenirken hata oluştu.' }).catch(() => {});
      }
    }
  } else if (update.message?.voice) {
    // Voice message — transcribe and treat as text
    const voiceFileId = update.message.voice.file_id;
    await sendMessage({ chatId, text: '🎤 Ses kaydi isleniyor...' }).catch(() => {});
    try {
      const { transcribed, success } = await handleVoiceMessage(voiceFileId);
      if (success && transcribed) {
        await sendMessage({
          chatId,
          text: `📝 *Transkript:*\n${transcribed}`,
          parseMode: 'Markdown',
        }).catch(() => {});
        await handleCommand(chatId, update.message.message_id, transcribed);
      } else {
        await sendMessage({ chatId, text: '⚠️ Ses kaydi cozulemedi. Lutfen tekrar deneyin.' }).catch(() => {});
      }
    } catch (err) {
      console.error('[voice] handler error:', err);
      await sendMessage({ chatId, text: '⚠️ Ses islemede hata olustu.' }).catch(() => {});
    }
  } else if (update.message?.text) {
    await handleCommand(
      chatId,
      update.message.message_id,
      update.message.text,
    );
  } else if (update.callback_query) {
    try {
      await handleCallback(update.callback_query);
    } catch (err) {
      console.error('[callback] Unhandled error:', err);
      // Try to answer callback even on error so Telegram stops retrying
      try {
        await answerCallbackQuery({ callbackQueryId: update.callback_query.id });
      } catch { /* ok */ }
    }
  }

  return NextResponse.json({ ok: true });
}

