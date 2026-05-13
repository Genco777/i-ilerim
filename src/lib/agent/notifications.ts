import { sendMessage } from '@/lib/telegram/bot';

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function notifyAdmins(text: string): Promise<void> {
  const ids = adminUserIds();
  if (ids.length === 0) return;
  await Promise.all(
    ids.map((chatId) =>
      sendMessage({ chatId, text }).catch((err) =>
        console.error(`[notify] sendMessage to ${chatId} failed:`, err),
      ),
    ),
  );
}

export function notifyInvoiceCreated(invoiceNumber: string, customerName: string, total: string): void {
  notifyAdmins(
    `🧾 Yeni fatura kesildi: **${invoiceNumber}**\nMüşteri: ${customerName}\nTutar: ${total}\n\nÖdeme takibi başlatıldı.`,
  );
}

export function notifyPostPublished(topic: string, channel: string): void {
  const icon = channel === 'story' || channel === 'reel' ? '📱' : '📘';
  notifyAdmins(
    `${icon} Gönderi yayınlandı: **${topic}**\nPlatform: Instagram/Facebook ${channel === 'story' ? '(Story)' : ''}`,
  );
}

export function notifyCustomerReplied(
  platform: string,
  senderName: string,
  preview: string,
): void {
  const icon = platform.startsWith('fb_') ? '📘' : platform.startsWith('ig_') ? '📷' : '💬';
  notifyAdmins(
    `${icon} **${senderName}** yanıt verdi (${platform})\n"${preview.slice(0, 200)}"`,
  );
}

export function notifyKleinanzeigenReply(threadId: string, buyerName: string): void {
  notifyAdmins(
    `🏷️ Kleinanzeigen yanıtı gönderildi\nAlıcı: ${buyerName || 'bilinmiyor'}\nThread: ${threadId.slice(0, 8)}...`,
  );
}

export function notifyAngebotConverted(angebotNumber: string, invoiceNumber: string): void {
  notifyAdmins(
    `🔄 Angebot **${angebotNumber}** → Fatura **${invoiceNumber}** dönüştürüldü.`,
  );
}
