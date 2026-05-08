import { setSecret, getSecret } from '@/lib/crypto/secrets';

const PAGE_TOKEN_KEY = 'fb_page_token';

export async function setPageToken(
  token: string,
  expiresAt?: Date,
): Promise<void> {
  await setSecret(PAGE_TOKEN_KEY, token, expiresAt);
}

export async function getPageToken(): Promise<string> {
  const token = await getSecret(PAGE_TOKEN_KEY);
  if (!token) {
    throw new Error(
      'FB Page Token not configured. Run scripts/setup-page-token.ts',
    );
  }
  return token;
}
