import {
  getIncomingMessage,
  updateIncomingMessage,
} from '@/lib/db/queries/messages';
import { publishReply } from '@/lib/meta/reply-client';
import { db } from '@/lib/db';
import { failedJobs } from '@/lib/db/schema';
import type { IncomingMessage } from '@/types';

export interface SentReply {
  message: IncomingMessage;
  reply_external_id: string;
}

/**
 * Send a reply to an incoming message and persist the result.
 *
 * - For comments: the parent_comment_id field is unused at write time;
 *   we reply against the comment external_id (stored as `external_id`
 *   on the incoming row).
 * - For DMs: we use `sender_external_id` as the recipient.
 */
export async function approveAndSendReply(
  messageId: string,
  finalText: string,
): Promise<SentReply> {
  const message = await getIncomingMessage(messageId);
  if (!message) throw new Error(`Message ${messageId} not found`);
  if (message.status === 'replied') {
    throw new Error('Already replied to this message');
  }

  try {
    const targetExternalId = message.platform.endsWith('_dm')
      ? message.sender_external_id
      : message.external_id;
    const result = await publishReply(
      message.platform,
      targetExternalId,
      finalText,
      message.platform.endsWith('_dm') ? message.sender_external_id : undefined,
    );

    const updated = await updateIncomingMessage(messageId, {
      status: 'replied',
      final_reply: finalText,
      reply_external_id: result.id,
      replied_at: new Date(),
    });

    return { message: updated, reply_external_id: result.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateIncomingMessage(messageId, {
      status: 'failed',
    }).catch(() => {});
    await db
      .insert(failedJobs)
      .values({
        job_type: 'send_reply',
        payload: { incoming_message_id: messageId, text: finalText },
        error: msg.slice(0, 1000),
        retry_count: 0,
      })
      .catch(() => {});
    throw err;
  }
}

export async function ignoreMessage(
  messageId: string,
): Promise<IncomingMessage> {
  const updated = await updateIncomingMessage(messageId, {
    status: 'ignored',
    ignored_at: new Date(),
  });
  return updated;
}
