import { NextResponse } from 'next/server';
import { fetchNewMail } from '@/lib/mail/imap-client';
import { insertInboxMessage } from '@/lib/db/queries/mail-inbox';
import { notifyIncomingMail } from '@/lib/telegram/notify-mail';
import { db } from '@/lib/db';
import { failedJobs } from '@/lib/db/schema';
import { isKleinanzeigenSender, handleKleinanzeigenMail } from '@/lib/kleinanzeigen';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface FolderStat {
  fetched: number;
  notified: number;
}

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get('x-cron-secret') === expected) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

async function logFailure(
  jobType: string,
  payload: Record<string, unknown>,
  error: string,
): Promise<void> {
  await db
    .insert(failedJobs)
    .values({
      job_type: jobType,
      payload,
      error: error.slice(0, 1000),
      retry_count: 0,
    })
    .catch(() => {
      /* swallow secondary errors */
    });
}

function bump(stats: Record<string, FolderStat>, folder: string): FolderStat {
  let s = stats[folder];
  if (!s) {
    s = { fetched: 0, notified: 0 };
    stats[folder] = s;
  }
  return s;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!checkAuth(req)) return unauthorized();

  const errors: string[] = [];
  const perFolder: Record<string, FolderStat> = {};
  let fetched = 0;
  let notified = 0;

  let result;
  try {
    result = await fetchNewMail();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure('mail_imap_fetch', {}, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  for (const folder of result.polledFolders) {
    bump(perFolder, folder);
  }

  fetched = result.mails.length;

  for (const mail of result.mails) {
    const stat = bump(perFolder, mail.folder);
    stat.fetched++;
    try {
      const row = await insertInboxMessage({
        uid: mail.uid,
        folder: mail.folder,
        message_id: mail.messageId,
        from_email: mail.fromEmail,
        from_name: mail.fromName,
        subject: mail.subject,
        body_preview: mail.bodyPreview,
        body_text: mail.bodyText,
        received_at: mail.receivedAt,
      });

      // Duplicate UID — skip notification (already processed previously)
      if (!row) continue;

      try {
        if (isKleinanzeigenSender(mail.fromEmail)) {
          await handleKleinanzeigenMail({
            fromEmail: mail.fromEmail,
            messageId: mail.messageId,
            bodyText: mail.bodyText ?? mail.bodyPreview ?? '',
          });
        } else {
          await notifyIncomingMail(row);
        }
        stat.notified++;
        notified++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`notify ${mail.folder}/${mail.uid}: ${msg}`);
        await logFailure('mail_inbox_notify', { folder: mail.folder, uid: mail.uid }, msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`insert ${mail.folder}/${mail.uid}: ${msg}`);
      await logFailure(
        'mail_inbox_insert',
        { folder: mail.folder, uid: mail.uid },
        msg,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    fetched,
    notified,
    perFolder,
    polledFolders: result.polledFolders,
    skippedFolders: result.skippedFolders,
    errorFolders: result.errorFolders,
    errors,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return GET(req);
}
