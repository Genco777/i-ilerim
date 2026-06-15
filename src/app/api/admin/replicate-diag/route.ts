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

  // Kling model erişim + balance test — video gen'in fail nedeni
  let klingCheck: unknown = null;
  let klingError: string | null = null;
  try {
    const klingRes = await fetch('https://api.replicate.com/v1/models/kwaivgi/kling-v1.6-standard', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'fly-froth-social/1.0' },
    });
    if (!klingRes.ok) {
      klingError = `Replicate /models/kwaivgi/kling-v1.6-standard ${klingRes.status}: ${(await klingRes.text()).slice(0, 400)}`;
    } else {
      const body = (await klingRes.json()) as { name?: string; visibility?: string; latest_version?: { id?: string }; default_example?: unknown };
      klingCheck = {
        name: body.name,
        visibility: body.visibility,
        latestVersionId: body.latest_version?.id,
      };
    }
  } catch (err) {
    klingError = err instanceof Error ? err.message : String(err);
  }

  // Balance check — Replicate hesabının kalan kredisi (paid model'lar için kritik)
  let balanceCheck: unknown = null;
  let balanceError: string | null = null;
  try {
    const balRes = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'fly-froth-social/1.0' },
    });
    if (!balRes.ok) {
      balanceError = `Account-2 ${balRes.status}: ${(await balRes.text()).slice(0, 300)}`;
    } else {
      const body = await balRes.json();
      balanceCheck = body;
    }
  } catch (err) {
    balanceError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    ok: true,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    tokenPreview,
    account: accountInfo,
    accountError,
    modelAccess: modelCheck,
    modelError,
    klingAccess: klingCheck,
    klingError,
    balance: balanceCheck,
    balanceError,
    next_steps: [
      '1. account.username — bu Replicate dashboard\'a girince üst sağdaki kullanıcı adınla aynı mı?',
      '2. Aynıysa: kredi propagation bekle (15dk\'ya kadar gider), tekrar test et',
      '3. Farklıysa: yanlış hesabın token\'ı kullanılıyor — Vercel env\'de REPLICATE_API_TOKEN doğru hesabın token\'ıyla değiştir',
      '4. modelError 404/403: nano-banana-2 erişim sorunu (nadir, modelin private olması)',
    ],
  });
}
