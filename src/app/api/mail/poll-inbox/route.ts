import { NextResponse } from 'next/server';
import { fetchNewMail } from '@/lib/mail/imap-client';
import { insertInboxMessage } from '@/lib/db/queries/mail-inbox';
import { notifyIncomingMail } from '@/lib/telegram/notify-mail';
import { db } from '@/lib/db';
import { failedJobs } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

export async function GET(req: Request): Promise<NextResponse> {
  if (!checkAuth(req)) return unauthorized();

  const errors: string[] = [];
  let fetched = 0;
  let notified = 0;

  let mails;
  try {
    mails = await fetchNewMail();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logFailure('mail_imap_fetch', {}, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  fetched = mails.length;

  for (const mail of mails) {
    try {
      const row = await insertInboxMessage({
        uid: mail.uid,
        message_id: mail.messageId,
        from_email: mail.fromEmail,
        from_name: mail.fromName,
        subject: mail.subject,
        body_preview: mail.bodyPreview,
        received_at: mail.receivedAt,
      });
      try {
        await notifyIncomingMail(row);
        notified++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`notify uid=${mail.uid}: ${msg}`);
        await logFailure('mail_inbox_notify', { uid: mail.uid }, msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`insert uid=${mail.uid}: ${msg}`);
      await logFailure('mail_inbox_insert', { uid: mail.uid }, msg);
    }
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    fetched,
    notified,
    errors,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return GET(req);
}
