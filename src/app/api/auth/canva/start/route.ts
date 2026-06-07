/**
 * GET /api/auth/canva/start?secret=<CRON_SECRET>
 *
 * Initiates Canva Connect OAuth 2.0. Browser → Canva izin ekranı → onayla →
 * /callback'e döner → tokens DB'ye yazılır.
 *
 * Tek seferlik admin işlemi. CRON_SECRET ile basit koruma.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';

const SCOPES = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read',
].join(' ');

function getRedirectUri(req: Request): string {
  if (process.env.CANVA_REDIRECT_URI) return process.env.CANVA_REDIRECT_URI;
  const url = new URL(req.url);
  return `${url.origin}/api/auth/canva/callback`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized — secret query param yanlış', { status: 401 });
  }

  if (!process.env.CANVA_CLIENT_ID) {
    return new NextResponse('CANVA_CLIENT_ID env tanımlı değil. Önce Vercel env\'lerine ekle.', { status: 500 });
  }

  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams({
    code_challenge_method: 'S256',
    response_type: 'code',
    client_id: process.env.CANVA_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });

  // Canva Connect OAuth code_challenge isteğe bağlı (PKCE) — basit confidential
  // flow'da skip edebiliriz. Client secret backend'de zaten var.
  params.delete('code_challenge_method');

  const authUrl = `${CANVA_AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('canva_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
