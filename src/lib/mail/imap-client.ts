import { ImapFlow, type ListResponse } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import {
  getLastSeenUid,
  insertInboxMessage,
} from '@/lib/db/queries/mail-inbox';

export interface NormalizedIncomingMail {
  uid: number;
  folder: string;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyText: string | null;
  receivedAt: Date;
}

// Whitelist: only these folders are polled. Everything else is skipped.
// Names matched case-insensitively against the last path segment.
const ALLOW_NAME_LOWER = new Set([
  'inbox',
  'gelen kutusu',
  'posteingang',
  'spam',
  'junk',
  'istenmeyen posta',
  'newsletter',
  'notification',
]);

function lastPathSegment(path: string): string {
  const parts = path.split(/[/.]/);
  return parts[parts.length - 1] ?? path;
}

function shouldSkip(box: ListResponse): boolean {
  const leaf = lastPathSegment(box.path).toLowerCase();
  return !ALLOW_NAME_LOWER.has(leaf);
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

async function pollFolder(
  client: ImapFlow,
  folder: string,
): Promise<NormalizedIncomingMail[]> {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    const lastSeen = await getLastSeenUid(folder);

    if (lastSeen === null) {
      const status = await client.status(folder, { uidNext: true });
      const next = status.uidNext;
      const sentinel =
        typeof next === 'number' && next > 1 ? next - 1 : 0;
      await insertInboxMessage({
        uid: sentinel,
        folder,
        message_id: null,
        from_email: 'sentinel@first-run.local',
        from_name: 'First-run sentinel',
        subject: null,
        body_preview: null,
        received_at: new Date(),
      });
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
        folder,
        messageId: parsed.messageId ?? null,
        fromEmail: email,
        fromName: name,
        subject: parsed.subject ?? null,
        bodyPreview: buildPreview(parsed),
        bodyText: (parsed.text ?? '').trim() || null,
        receivedAt,
      });
    }
    return results;
  } finally {
    lock.release();
  }
}

export interface FetchResult {
  mails: NormalizedIncomingMail[];
  polledFolders: string[];
  skippedFolders: string[];
  errorFolders: { folder: string; error: string }[];
}

export async function fetchNewMail(): Promise<FetchResult> {
  const client = buildClient();
  await client.connect();

  try {
    const boxes = await client.list();
    const result: FetchResult = {
      mails: [],
      polledFolders: [],
      skippedFolders: [],
      errorFolders: [],
    };
    for (const box of boxes) {
      if (shouldSkip(box)) {
        result.skippedFolders.push(box.path);
        continue;
      }
      try {
        const items = await pollFolder(client, box.path);
        result.polledFolders.push(box.path);
        for (const item of items) result.mails.push(item);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errorFolders.push({ folder: box.path, error: msg });
      }
    }
    return result;
  } finally {
    await client.logout().catch(() => {
      /* swallow */
    });
  }
}
