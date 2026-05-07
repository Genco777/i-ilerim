// Minimal Telegram Bot API client.
// Full feature set (sendPhoto, inline keyboard, editMessageReplyMarkup,
// answerCallbackQuery) lands in Task 19 — this file is the foundation.

const API_BASE = 'https://api.telegram.org/bot';

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

interface SendMessageOptions {
  chatId: number | string;
  text: string;
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  replyMarkup?: unknown;
  disableNotification?: boolean;
}

export async function sendMessage(opts: SendMessageOptions): Promise<void> {
  const url = `${API_BASE}${token()}/sendMessage`;
  const body = {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: opts.parseMode,
    reply_markup: opts.replyMarkup,
    disable_notification: opts.disableNotification,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram sendMessage failed (${res.status}): ${text}`);
  }
}

export async function setWebhook(url: string, secret?: string): Promise<void> {
  const apiUrl = `${API_BASE}${token()}/setWebhook`;
  const body = {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query'],
  };
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram setWebhook failed (${res.status}): ${text}`);
  }
}
