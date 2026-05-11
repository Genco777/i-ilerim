import { sendMail } from '@/lib/mail/smtp';
import type { KleinanzeigenThread } from '@/types';

export async function sendKleinanzeigenReply(
  thread: KleinanzeigenThread,
  replyText: string,
): Promise<{ messageId: string }> {
  const subject = thread.listing_title
    ? `Re: ${thread.listing_title}`
    : 'Re: Kleinanzeigen Nachricht';
  return sendMail({
    to: thread.sender_address,
    subject,
    body: replyText,
    attachments: thread.attachments ?? [],
    ...(thread.email_message_id
      ? { inReplyTo: thread.email_message_id, references: thread.email_message_id }
      : {}),
  });
}
