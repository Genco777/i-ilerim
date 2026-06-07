/**
 * GET /api/auth/canva/start?secret=<CRON_SECRET>
 *
 * Initiates Canva Connect OAuth 2.0 with PKCE (S256).
 * Canva Connect API PKCE'yi ZORUNLU yapıyor — code_challenge olmadan 400.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';

// Canva Connect API scope'ları — Mehmet'in app'inde aktif olanlar (screenshot).
// brandtemplate:* APP'TE AKTİF (önceden yanlışlıkla çıkardım, autofill 403'ün sebebi).
// design:meta:read app'te kapalı → çıkarıldı.
const SCOPES = [
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
].join(' ');

function getRedirectUri(req: Request): string {
  if (process.env.CANVA_REDIRECT_URI) return process.env.CANVA_REDIRECT_URI;
  const url = new URL(req.url);
  return `${url.origin}/api/auth/canva/callback`;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized — secret query param yanlış', { status: 401 });
  }

  if (!process.env.CANVA_CLIENT_ID) {
    return new NextResponse("CANVA_CLIENT_ID env tanımlı değil. Önce Vercel env'lerine ekle.", { status: 500 });
  }

  // PKCE — code_verifier 43-128 char random, code_challenge SHA256(verifier) base64url
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32)); // 43 char
  const codeChallenge = base64UrlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest(),
  );
  const state = crypto.randomUUID();
  const redirectUri = getRedirectUri(req);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CANVA_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${CANVA_AUTHORIZE_URL}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  // State + verifier 10 dk httpOnly cookie
  response.cookies.set('canva_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  response.cookies.set('canva_oauth_verifier', codeVerifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}
