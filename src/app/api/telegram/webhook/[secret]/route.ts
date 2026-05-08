import { NextResponse } from 'next/server';
import {
  sendMessage,
  sendPhoto,
  answerCallbackQuery,
  editMessageReplyMarkup,
  getFile,
  downloadFile,
} from '@/lib/telegram/bot';
import { previewKeyboard, rawKeyboard } from '@/lib/telegram/keyboard';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import {
  generatePost,
  regenerateImage,
  regenerateText,
} from '@/lib/content/generate-post';
import { getPost, deletePost } from '@/lib/db/queries/posts';

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

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
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
  '  /post <konu>  — AI metin + görsel üret + onay iste',
  '  /raw <metin>  — manuel paylaşım (foto ekle, AI dokunmaz)',
  '  /help         — bu mesaj',
  '',
  'Onay sonrası FB Page + IG Business hesabına yayınlanır.',
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
): Promise<void> {
  // Acknowledge before the long-running AI calls.
  await sendMessage({
    chatId,
    text: `🎨 Üretiliyor: "${topic}"\n(15-30 saniye sürer, biraz bekle…)`,
  });

  try {
    const post = await generatePost({
      topic,
      telegramChatId: String(chatId),
      telegramMessageId: String(messageId),
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
      caption: caption.slice(0, 1024), // Telegram caption limit
      replyMarkup: previewKeyboard(post.id),
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
): Promise<void> {
  // Publishing wires up in Tasks 25-28. For now just inform.
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({
    chatId,
    text: [
      `✓ ${postId} onaylandı.`,
      '🚧 Gerçek FB+IG yayını Task 25-28\'de devreye girecek.',
      'Şu an sadece DB\'de status değiştirir.',
    ].join('\n'),
  });
  // TODO (Task 28): call publisher.publishPost(postId)
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

  if (trimmed.startsWith('/post')) {
    const topic = trimmed.slice('/post'.length).trim();
    if (!topic) {
      await sendMessage({
        chatId,
        text: 'Kullanım: /post <konu>\nÖrnek: /post Visitenkarten promosyonu, %20 indirim',
      });
      return;
    }
    await handlePostCommand(chatId, messageId, topic);
    return;
  }

  if (trimmed.startsWith('/raw')) {
    await handleRawCommand(chatId);
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
      await handleApprove(chatId, messageId, postId);
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

