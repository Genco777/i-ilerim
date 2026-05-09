import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import {
  fetchFBPageComments,
  fetchIGComments,
  type NormalizedComment,
} from '@/lib/meta/poll-client';
import { insertIncomingIfNew } from '@/lib/db/queries/messages';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { generateReply } from '@/lib/ai/reply';
import { notifyNewMessage } from '@/lib/telegram/notify';
import { db } from '@/lib/db';
import { failedJobs, incomingMessages } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel sends `Authorization: Bearer <CRON_SECRET>` for scheduled crons.
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  // Manual trigger via header for testing.
  if (req.headers.get('x-cron-secret') === expected) return true;
  // Fallback: ?secret= in query.
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

interface ProcessResult {
  inserted: number;
  notified: number;
  errors: number;
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

async function processComments(
  comments: NormalizedComment[],
): Promise<ProcessResult> {
  const result: ProcessResult = { inserted: 0, notified: 0, errors: 0 };
  if (comments.length === 0) return result;

  const brandKit = await getBrandKit();

  for (const c of comments) {
    try {
      const inserted = await insertIncomingIfNew({
        platform: c.platform,
        external_id: c.external_id,
        parent_post_id: c.parent_post_id,
        parent_comment_id: c.parent_comment_id,
        sender_name: c.sender_name,
        sender_external_id: c.sender_external_id,
        message_text: c.message_text,
        received_at: c.received_at,
      });
      if (!inserted) continue; // already seen
      result.inserted++;

      let draft = '';
      try {
        draft = await generateReply(
          {
            sender_name: c.sender_name,
            message_text: c.message_text,
            platform: c.platform,
          },
          brandKit,
          c.parent_post_text ?? undefined,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await logFailure(
          'generate_reply',
          { incoming_message_id: inserted.id },
          msg,
        );
      }

      await db
        .update(incomingMessages)
        .set({
          draft_reply: draft || null,
          status: 'awaiting_approval',
        })
        .where(eq(incomingMessages.id, inserted.id));

      try {
        await notifyNewMessage(
          {
            ...inserted,
            draft_reply: draft || null,
            status: 'awaiting_approval',
          },
          draft || '(Taslak üretilemedi — manuel cevap gerekli)',
        );
        result.notified++;
      } catch (err) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        await logFailure(
          'telegram_notify',
          { incoming_message_id: inserted.id },
          msg,
        );
      }
    } catch (err) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      await logFailure(
        'poll_process_comment',
        { platform: c.platform, external_id: c.external_id },
        msg,
      );
    }
  }

  return result;
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!checkAuth(req)) return unauthorized();

  const totals: Record<string, ProcessResult> = {};
  const errors: string[] = [];

  try {
    const fb = await fetchFBPageComments(10);
    totals.fb = await processComments(fb);
  } catch (err) {
    errors.push(`fb: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const ig = await fetchIGComments(10);
    totals.ig = await processComments(ig);
  } catch (err) {
    errors.push(`ig: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    totals,
    errors,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return GET(req);
}
