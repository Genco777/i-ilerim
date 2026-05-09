// Telegram Bot API client.
// Covers: sendMessage, sendPhoto (URL or buffer), editMessageReplyMarkup,
// answerCallbackQuery, setWebhook.

const API_BASE = 'https://api.telegram.org/bot';

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

interface BaseSendOptions {
  chatId: number | string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyMarkup?: InlineKeyboardMarkup;
  disableNotification?: boolean;
}

interface SendMessageOptions extends BaseSendOptions {
  text: string;
}

interface SendPhotoOptions extends BaseSendOptions {
  photo: string;          // URL when sending by URL
  caption?: string;
}

interface EditMarkupOptions {
  chatId: number | string;
  messageId: number;
  replyMarkup?: InlineKeyboardMarkup;
}

interface AnswerCallbackOptions {
  callbackQueryId: string;
  text?: string;
  showAlert?: boolean;
}

async function call<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!res.ok || !json.ok) {
    throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  }
  return json.result as T;
}

export interface SendMessageResult {
  message_id: number;
  chat: { id: number };
}

export async function sendMessage(
  opts: SendMessageOptions,
): Promise<SendMessageResult> {
  return call<SendMessageResult>('sendMessage', {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode,
    reply_markup: opts.replyMarkup,
    disable_notification: opts.disableNotification,
  });
}

export async function sendPhoto(
  opts: SendPhotoOptions,
): Promise<SendMessageResult> {
  return call<SendMessageResult>('sendPhoto', {
    chat_id: opts.chatId,
    photo: opts.photo,
    caption: opts.caption,
    parse_mode: opts.parseMode,
    reply_markup: opts.replyMarkup,
    disable_notification: opts.disableNotification,
  });
}

export async function editMessageReplyMarkup(
  opts: EditMarkupOptions,
): Promise<void> {
  await call('editMessageReplyMarkup', {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    reply_markup: opts.replyMarkup,
  });
}

interface EditMessageTextOptions {
  chatId: number | string;
  messageId: number;
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyMarkup?: InlineKeyboardMarkup;
}

export async function editMessageText(
  opts: EditMessageTextOptions,
): Promise<void> {
  await call('editMessageText', {
    chat_id: opts.chatId,
    message_id: opts.messageId,
    text: opts.text,
    parse_mode: opts.parseMode,
    reply_markup: opts.replyMarkup,
  });
}

export async function answerCallbackQuery(
  opts: AnswerCallbackOptions,
): Promise<void> {
  await call('answerCallbackQuery', {
    callback_query_id: opts.callbackQueryId,
    text: opts.text,
    show_alert: opts.showAlert ?? false,
  });
}

export async function setWebhook(url: string): Promise<void> {
  await call('setWebhook', {
    url,
    allowed_updates: ['message', 'callback_query'],
  });
}

interface FileInfo {
  file_id: string;
  file_path: string;
  file_size?: number;
}

export async function getFile(fileId: string): Promise<FileInfo> {
  return call<FileInfo>('getFile', { file_id: fileId });
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${token()}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Telegram file download failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
