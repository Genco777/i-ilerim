import { auth } from '@/lib/auth';
import { uploadImage } from '@/lib/blob';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadImage(buffer, file.name, file.type);
  return NextResponse.json(result);
}
