/**
 * GET /api/auth/pinterest/callback?code=...&state=...
 *
 * Pinterest redirects here after user approves. Validates state, exchanges
 * code for tokens, persists encrypted in secrets table.
 */

import { NextResponse } from 'next/server';
import { exchangeCodeForToken, persistTokens } from '@/lib/publish/pinterest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_NAME = 'pinterest_oauth_state';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return html(`<h1>Reddedildi</h1><p>${escape(error)}</p>`, 400);
  if (!code || !state) return html('<h1>Eksik parametre</h1>', 400);

  const cookieState = parseCookie(req.headers.get('cookie') ?? '', COOKIE_NAME);
  if (!cookieState || cookieState !== state) {
    return html('<h1>State mismatch</h1><p>Tekrar başla.</p>', 400);
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    await persistTokens(tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return html(`<h1>Token exchange başarısız</h1><pre>${escape(msg)}</pre>`, 500);
  }

  const res = html(
    `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>Pinterest bağlandı</title>
<style>body{font-family:system-ui,sans-serif;background:#1a2536;color:#f0f3f8;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;padding:24px}
.card{max-width:480px;background:#243248;border:1px solid #364963;border-radius:14px;padding:32px;text-align:center}
h1{margin:0 0 12px;font-size:22px;font-weight:600}p{margin:0 0 16px;color:#a8b5c7;line-height:1.5}</style></head>
<body><div class="card"><h1>📌 Pinterest bağlandı</h1>
<p>Refresh token kaydedildi. Bir sonraki ürün onayında otomatik olarak boardlarına pin atılacak.</p></div></body></html>`,
    200,
  );
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}

function parseCookie(header: string, name: string): string | null {
  for (const p of header.split(';')) {
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
