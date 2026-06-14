import { sendMessage } from '@/lib/telegram/bot';
import { actionMenuKeyboard } from '@/lib/telegram/kleinanzeigen-keyboard';
import { createThread, updateThread } from '@/lib/db/queries/kleinanzeigen';
import { parseKleinanzeigenBody, extractRoutingToken } from './detector';
import { analyzeKleinanzeigenMessage } from './analyzer';
import { buildInitialMessage } from './telegram-ui';
import type { KleinanzeigenAnalysis } from '@/types';

export { isKleinanzeigenSender } from './detector';

export interface KleinanzeigenInput {
  fromEmail: string;
  messageId: string | null;
  bodyText: string;
}

function notifyChatId(): number {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) throw new Error('ALLOWED_TELEGRAM_USER_IDS not set');
  const first = raw.split(',')[0]?.trim();
  if (!first) throw new Error('ALLOWED_TELEGRAM_USER_IDS is empty');
  const n = Number(first);
  if (!Number.isFinite(n)) throw new Error('ALLOWED_TELEGRAM_USER_IDS is not a number');
  return n;
}

export async function handleKleinanzeigenMail(input: KleinanzeigenInput): Promise<void> {
  const token = extractRoutingToken(input.fromEmail);
  if (!token) return;

  const parsed = parseKleinanzeigenBody(input.bodyText);
  const chatId = notifyChatId();

  const { getConversationHistory } = await import('@/lib/db/queries/kleinanzeigen');
  const history = await getConversationHistory(token).catch(() => []);

  let analysis: KleinanzeigenAnalysis;
  try {
    analysis = await analyzeKleinanzeigenMessage(parsed.message, history);
  } catch (err) {
    analysis = { subject: 'Kleinanzeigen Nachricht', lang: 'de', tone_detected: 'unknown', knowledge_gaps: [] };
    console.error('Kleinanzeigen analysis failed:', err);
  }

  const thread = await createThread({
    email_message_id: input.messageId,
    routing_token: token,
    sender_address: input.fromEmail,
    buyer_name: parsed.buyerName,
    listing_title: parsed.listingTitle,
    raw_body: parsed.message,
    ai_analysis: analysis,
    status: 'awaiting_action',
    telegram_chat_id: chatId,
  });

  const gapTopic = analysis.knowledge_gaps[0] ?? null;
  const sent = await sendMessage({
    chatId,
    text: buildInitialMessage(thread),
    replyMarkup: actionMenuKeyboard(thread.id, gapTopic),
  });
  await updateThread(thread.id, { telegram_message_id: sent.message_id });
}
