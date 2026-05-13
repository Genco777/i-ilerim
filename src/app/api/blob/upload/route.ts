import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    const url = new URL(req.url);
    if (auth !== `Bearer ${expected}` && url.searchParams.get('secret') !== expected) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
  }

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'file gerekli' }, { status: 400 });

    const folder = (form.get('folder') as string) || 'general';
    const filename = `${folder}/${Date.now()}-${(file as File).name || 'upload'}`;

    const blob = await put(filename, file, {
      access: 'public',
      addRandomSuffix: true,
    });

    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname });
  } catch (err) {
    console.error('[blob/upload] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}
