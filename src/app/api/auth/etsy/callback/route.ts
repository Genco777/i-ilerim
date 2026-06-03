/**
 * GET /api/auth/etsy/callback?code=...&state=...
 *
 * Etsy redirects here after user approves. We:
 *   1. Validate state nonce matches the cookie we set in /start
 *   2. POST to /v3/public/oauth/token with code + verifier
 *   3. Persist access + refresh tokens (encrypted) in the secrets table
 *   4. Clear the PKCE cookie
 *   5. Show a tiny "connected" page so the user knows it worked
 */

import { NextResponse } from 'next/server';
import { exchangeCodeForToken, persistTokens } from '@/lib/publish/etsy.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'etsy_oauth_pkce';

interface PkceCookie {
  verifier: string;
  state: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return html(
      `<h1>Etsy bağlantı reddedildi</h1><p>Etsy şu hatayı döndü: <code>${escape(error)}</code></p>`,
      400,
    );
  }
  if (!code || !state) {
    return html('<h1>Eksik parametre</h1><p>code veya state yok.</p>', 400);
  }

  const cookie = req.headers.get('cookie') ?? '';
  const raw = parseCookie(cookie, COOKIE_NAME);
  if (!raw) {
    return html(
      '<h1>Süresi geçti</h1><p>PKCE cookie bulunamadı — /api/auth/etsy/start ile tekrar başla.</p>',
      400,
    );
  }
  let pkce: PkceCookie;
  try {
    pkce = JSON.parse(raw) as PkceCookie;
  } catch {
    return html('<h1>Cookie corrupt</h1><p>Tekrar başla.</p>', 400);
  }
  if (pkce.state !== state) {
    return html('<h1>State mismatch</h1><p>Olası CSRF — tekrar başla.</p>', 400);
  }

  try {
    const tokens = await exchangeCodeForToken({ code, verifier: pkce.verifier });
    await persistTokens(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return html(
      `<h1>Token exchange başarısız</h1><pre style="white-space:pre-wrap">${escape(msg)}</pre>`,
      500,
    );
  }

  const res = html(
    `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>Etsy bağlandı · Fly &amp; Froth</title>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;background:#1a2536;color:#f0f3f8;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
    .card{max-width:480px;background:#243248;border:1px solid #364963;border-radius:14px;padding:32px;text-align:center}
    h1{margin:0 0 12px;font-size:22px;font-weight:600}
    p{margin:0 0 16px;color:#a8b5c7;line-height:1.5}
    code{background:#0f1825;padding:2px 6px;border-radius:4px;font-size:13px}
  </style>
</head>
<body>
  <div class="card">
    <h1>✅ Etsy bağlandı</h1>
    <p>Refresh token kaydedildi (encrypted, secrets tablosunda).</p>
    <p>Bu sekmeyi kapatabilirsin. Bir sonraki ürün onayında Etsy'de otomatik draft listing oluşturulacak.</p>
    <p><code>shop_id: ${process.env.ETSY_SHOP_ID ?? '?'}</code></p>
  </div>
</body>
</html>`,
    200,
  );
  // Clear PKCE cookie — single-use.
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}

function parseCookie(header: string, name: string): string | null {
  const parts = header.split(';');
  for (const p of parts) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function html(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function escape(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;',
  );
}
