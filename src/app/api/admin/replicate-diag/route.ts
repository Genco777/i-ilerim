/**
 * GET /api/admin/replicate-diag?secret=<CRON_SECRET>
 *
 * Replicate hesap teşhisi — kullanılan REPLICATE_API_TOKEN hangi hesaba ait?
 * Kredi yüklediğin hesapla aynı mı?
 *
 * Replicate /v1/account endpoint username + type döner. Balance göstermez ama
 * username doğrulanır.
 *
 * READ-ONLY.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'REPLICATE_API_TOKEN env yok' });
  }

  // Token preview — sadece ilk/son 4 karakter, güvenlik için ortayı maskele
  const tokenPreview = token.length > 12
    ? `${token.slice(0, 6)}...${token.slice(-4)} (len ${token.length})`
    : `${token.slice(0, 4)}... (len ${token.length})`;

  // Account info
  let accountInfo: unknown = null;
  let accountError: string | null = null;
  try {
    const accRes = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'fly-froth-social/1.0' },
    });
    if (!accRes.ok) {
      accountError = `Replicate /account ${accRes.status}: ${(await accRes.text()).slice(0, 250)}`;
    } else {
      accountInfo = await accRes.json();
    }
  } catch (err) {
    accountError = err instanceof Error ? err.message : String(err);
  }

  // Quick model availability check — banana 2 erişimi var mı?
  let modelCheck: unknown = null;
  let modelError: string | null = null;
  try {
    const modelRes = await fetch('https://api.replicate.com/v1/models/google/nano-banana-2', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'fly-froth-social/1.0' },
    });
    if (!modelRes.ok) {
      modelError = `Replicate /models/google/nano-banana-2 ${modelRes.status}: ${(await modelRes.text()).slice(0, 250)}`;
    } else {
      const body = (await modelRes.json()) as { name?: string; owner?: string; visibility?: string; latest_version?: { id?: string } };
      modelCheck = {
        name: body.name,
        owner: body.owner,
        visibility: body.visibility,
        latestVersionId: body.latest_version?.id,
      };
    }
  } catch (err) {
    modelError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    ok: true,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    tokenPreview,
    account: accountInfo,
    accountError,
    modelAccess: modelCheck,
    modelError,
    next_steps: [
      '1. account.username — bu Replicate dashboard\'a girince üst sağdaki kullanıcı adınla aynı mı?',
      '2. Aynıysa: kredi propagation bekle (15dk\'ya kadar gider), tekrar test et',
      '3. Farklıysa: yanlış hesabın token\'ı kullanılıyor — Vercel env\'de REPLICATE_API_TOKEN doğru hesabın token\'ıyla değiştir',
      '4. modelError 404/403: nano-banana-2 erişim sorunu (nadir, modelin private olması)',
    ],
  });
}
