import { auth } from '@/lib/auth';
import { getBrandKit, updateBrandKit } from '@/lib/db/queries/brand-kit';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const kit = await getBrandKit();
  return NextResponse.json(kit);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const updated = await updateBrandKit(body);
  return NextResponse.json(updated);
}
