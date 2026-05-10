import { sendMessage } from './bot';
import type { MailInbox } from '@/types';
import type { InlineKeyboardMarkup } from './bot';

function inboxReplyKeyboard(inboxId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '💬 Cevap yaz', callback_data: `mail_reply:${inboxId}` },
      ],
    ],
  };
}

function notifyChatId(): number | null {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  if (!first) return null;
  const n = Number(first);
  return Number.isFinite(n) ? n : null;
}

function formatBody(inbox: MailInbox): string {
  const fromLine = inbox.from_name
    ? `${inbox.from_name} <${inbox.from_email}>`
    : inbox.from_email;
  const subjectLine = inbox.subject ?? '(konusuz)';
  const preview = (inbox.body_preview ?? '').trim();
  const previewLine = preview.length > 0 ? preview : '(önizleme yok)';
  const header =
    inbox.folder && inbox.folder !== 'INBOX'
      ? `📧 Yeni mail (📁 ${inbox.folder})`
      : '📧 Yeni mail';
  return [
    header,
    `Kimden: ${fromLine}`,
    `Konu: ${subjectLine}`,
    '',
    previewLine.slice(0, 1500),
  ].join('\n');
}

export async function notifyIncomingMail(inbox: MailInbox): Promise<void> {
  const chatId = notifyChatId();
  if (!chatId) {
    throw new Error(
      'ALLOWED_TELEGRAM_USER_IDS not set — cannot route inbox notifications',
    );
  }
  await sendMessage({
    chatId,
    text: formatBody(inbox),
    replyMarkup: inboxReplyKeyboard(inbox.id),
  });
}
