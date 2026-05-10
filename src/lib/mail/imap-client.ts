import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { getLastSeenUid, getCurrentMaxUid } from '@/lib/db/queries/mail-inbox';

export interface NormalizedIncomingMail {
  uid: number;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: Date;
}

function buildClient(): ImapFlow {
  const host = process.env.ZOHO_IMAP_HOST;
  const port = Number(process.env.ZOHO_IMAP_PORT ?? 993);
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('ZOHO_IMAP_HOST / ZOHO_SMTP_USER / ZOHO_SMTP_PASS not set');
  }
  return new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user, pass },
    logger: false,
  });
}

function buildPreview(parsed: ParsedMail): string | null {
  const text = (parsed.text ?? '').trim();
  if (text.length > 0) return text.slice(0, 500);
  const html = (parsed.html || '').toString();
  if (!html) return null;
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 500);
}

function extractFrom(parsed: ParsedMail): { email: string; name: string | null } {
  const fromArr = parsed.from?.value;
  const first = fromArr && fromArr.length > 0 ? fromArr[0] : undefined;
  const email = first?.address ?? '';
  const name = first?.name && first.name.length > 0 ? first.name : null;
  return { email, name };
}

export async function fetchNewMail(): Promise<NormalizedIncomingMail[]> {
  const client = buildClient();
  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const lastSeen = await getLastSeenUid();

      // First-run guard: seed last-seen UID with current mailbox max,
      // skip notifying any pre-existing mail.
      if (lastSeen === null) {
        const max = await getCurrentMaxUidFromImap(client);
        if (max !== null) {
          await seedFirstRunSentinel(max);
        }
        return [];
      }

      const range = `${lastSeen + 1}:*`;
      const uids = await client.search({ uid: range }, { uid: true });
      if (!uids || uids.length === 0) return [];

      const results: NormalizedIncomingMail[] = [];
      for await (const message of client.fetch(
        { uid: range },
        { uid: true, envelope: true, source: true, internalDate: true },
      )) {
        if (!message.source) continue;
        let parsed: ParsedMail;
        try {
          parsed = await simpleParser(message.source);
        } catch {
          continue;
        }

        const { email, name } = extractFrom(parsed);
        if (!email) continue;

        const internal = message.internalDate;
        const receivedAt =
          parsed.date instanceof Date
            ? parsed.date
            : internal instanceof Date
              ? internal
              : new Date();

        results.push({
          uid: Number(message.uid),
          messageId: parsed.messageId ?? null,
          fromEmail: email,
          fromName: name,
          subject: parsed.subject ?? null,
          bodyPreview: buildPreview(parsed),
          receivedAt,
        });
      }
      return results;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {
      /* swallow */
    });
  }
}

async function getCurrentMaxUidFromImap(
  client: ImapFlow,
): Promise<number | null> {
  const status = await client.status('INBOX', { uidNext: true });
  const next = status.uidNext;
  if (typeof next !== 'number' || next <= 1) return null;
  return next - 1;
}

// Insert a sentinel inbox row so subsequent polls have a baseline UID.
// Uses neon directly through the existing query layer.
async function seedFirstRunSentinel(uid: number): Promise<void> {
  const { insertInboxMessage } = await import('@/lib/db/queries/mail-inbox');
  await insertInboxMessage({
    uid,
    message_id: null,
    from_email: 'sentinel@first-run.local',
    from_name: 'First-run sentinel',
    subject: null,
    body_preview: null,
    received_at: new Date(),
  });
}
