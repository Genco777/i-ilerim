import { put } from '@vercel/blob';

export interface UploadResult {
  url: string;
  pathname: string;
}

export async function uploadImage(
  buffer: Buffer,
  filename: string,
  contentType = 'image/png',
): Promise<UploadResult> {
  const blob = await put(filename, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
  });
  return { url: blob.url, pathname: blob.pathname };
}
