import { sendMessage } from './bot';
import { replyKeyboard } from './keyboard';
import type { IncomingMessage } from '@/types';

function platformIcon(platform: string): string {
  if (platform.startsWith('fb_')) return '📘';
  if (platform.startsWith('ig_')) return '📷';
  if (platform.startsWith('wa_')) return '💬';
  return '✉️';
}

function platformLabel(platform: string): string {
  switch (platform) {
    case 'fb_comment':
      return 'FB yorumu';
    case 'fb_dm':
      return 'FB DM';
    case 'ig_comment':
      return 'IG yorumu';
    case 'ig_dm':
      return 'IG DM';
    case 'wa_message':
      return 'WhatsApp';
    default:
      return platform;
  }
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'şimdi';
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} sa önce`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} gün önce`;
}

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/**
 * Notify the admin Telegram chat(s) about a new inbound message
 * with an AI-drafted reply and inline action buttons.
 */
export async function notifyNewMessage(
  msg: IncomingMessage,
  draft: string,
): Promise<void> {
  const text = [
    `${platformIcon(msg.platform)} Yeni ${platformLabel(msg.platform)} (${msg.sender_name}, ${relativeTime(msg.received_at)}):`,
    `"${msg.message_text.slice(0, 800)}"`,
    '',
    '🤖 Önerilen cevap:',
    `"${draft}"`,
  ].join('\n');

  const ids = adminUserIds();
  await Promise.all(
    ids.map((chatId) =>
      sendMessage({
        chatId,
        text,
        replyMarkup: replyKeyboard(msg.id),
      }).catch((err) => {
        // Don't fail the polling job over a notification error.
        console.error(`[notify] sendMessage to ${chatId} failed:`, err);
      }),
    ),
  );
}
