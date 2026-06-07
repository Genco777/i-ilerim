/**
 * GET /api/auth/canva/callback?code=...&state=...
 *
 * Canva OAuth redirect handler — code → tokens, DB'ye yaz, başarı sayfası.
 */

import { NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/canva/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getRedirectUri(req: Request): string {
  if (process.env.CANVA_REDIRECT_URI) return process.env.CANVA_REDIRECT_URI;
  const url = new URL(req.url);
  return `${url.origin}/api/auth/canva/callback`;
}

function parseCookie(header: string, name: string): string | null {
  for (const p of header.split(';')) {
    const [k, ...rest] = p.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return html(`<h1>Reddedildi</h1><p>${error}</p>`, 400);
  if (!code) return html('<h1>Eksik authorization code</h1>', 400);

  // CSRF check
  const cookieState = parseCookie(req.headers.get('cookie') ?? '', 'canva_oauth_state');
  if (!cookieState || cookieState !== state) {
    return html('<h1>State mismatch — CSRF check failed</h1><p>/api/auth/canva/start ile baştan dene.</p>', 400);
  }

  try {
    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const expiresInH = Math.round((tokens.expires_at - Date.now()) / (1000 * 60 * 60));

    return html(`<!doctype html>
<html><head><meta charset="utf-8"><title>Canva bağlandı</title>
<style>
  body{font-family:'Inter',system-ui,sans-serif;max-width:560px;margin:80px auto;padding:0 20px;line-height:1.5;color:#1D2233;background:#FCFCFC}
  h1{font-weight:800;letter-spacing:-1px;font-size:32px;margin-bottom:8px}
  .ok{background:#F2F4F8;padding:24px;border-radius:12px;border-left:4px solid #5B6BB0;margin:24px 0}
  code{background:#eee;padding:2px 8px;border-radius:4px;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:0.92em}
  .next{margin-top:24px;font-size:0.95em;color:#6E7488}
</style></head>
<body>
  <h1>✅ Canva bağlandı</h1>
  <div class="ok">
    <p><strong>Token süresi:</strong> ~${expiresInH} saat (auto-refresh çalışır)</p>
    <p><strong>Scope:</strong> design:content:read/write, asset:read/write, brandtemplate:content/meta:read</p>
  </div>
  <p>Token'lar DB'ye kaydedildi (<code>system_config.canva_tokens</code>).</p>
  <p class="next">Sıradaki adım: <code>/post webdesign</code> ile test et — artık Canva brand template autofill ile gerçek görsel gelir.</p>
</body></html>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return html(`<h1>Token exchange başarısız</h1><pre style="background:#f5f5f5;padding:12px;border-radius:6px;overflow:auto">${msg.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]!))}</pre>`, 500);
  }
}
