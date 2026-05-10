import { NextResponse } from 'next/server';
import {
  sendMessage,
  sendPhoto,
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
} from '@/lib/telegram/keyboard';
import { mailPreviewKeyboard } from '@/lib/telegram/mail-keyboard';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import {
  generatePost,
  regenerateImage,
  regenerateText,
} from '@/lib/content/generate-post';
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
  '  /edit_reply <id> <text> — gelen mesaja taslak cevabı düzenle',
  '  /preview_reply <id>     — taslağı butonlu önizle',
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

  // No command matched: check if an active mail draft is awaiting regen input.
  const activeDraft = await getActiveDraft(chatId);
  if (activeDraft && activeDraft.status === 'awaiting_regen') {
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

