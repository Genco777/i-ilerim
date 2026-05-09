import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getIncomingMessage,
  updateIncomingMessage,
} from '@/lib/db/queries/messages';
import {
  approveAndSendReply,
  ignoreMessage,
} from '@/lib/messages/reply-manager';

interface Body {
  action: 'send' | 'ignore' | 'save';
  text?: string;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as Body;

  const existing = await getIncomingMessage(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    if (body.action === 'ignore') {
      const updated = await ignoreMessage(id);
      return NextResponse.json({ ok: true, status: updated.status });
    }

    if (body.action === 'save') {
      const updated = await updateIncomingMessage(id, {
        draft_reply: body.text ?? null,
      });
      return NextResponse.json({ ok: true, status: updated.status });
    }

    if (body.action === 'send') {
      const text = (body.text ?? '').trim();
      if (!text) {
        return NextResponse.json(
          { error: 'Empty reply text' },
          { status: 400 },
        );
      }
      const result = await approveAndSendReply(id, text);
      return NextResponse.json({
        ok: true,
        status: result.message.status,
        reply_external_id: result.reply_external_id,
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${body.action}` },
      { status: 400 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
