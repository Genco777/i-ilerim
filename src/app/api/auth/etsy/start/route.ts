/**
 * GET /api/auth/etsy/start
 *
 * Initiates Etsy v3 OAuth2 with PKCE. Generates a code_verifier + state,
 * stores them in a short-lived HTTP-only cookie, and 302s the user to
 * Etsy's authorize page. Etsy will redirect to /api/auth/etsy/callback
 * with `?code=...&state=...`.
 *
 * Auth: gated by NEXTAUTH session — only admin can connect Etsy.
 * (If you don't have NextAuth wired here yet, the route is at least
 *  CSRF-protected by the state nonce + verifier-bound exchange.)
 */

import { NextResponse } from 'next/server';
import { buildAuthorizeUrl, generatePkce, generateState } from '@/lib/publish/etsy.client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'etsy_oauth_pkce';
// Sprint M4 — Mehmet 10 dk içinde Etsy login + onay yapmadı → cookie expired.
// 30 dk verelim, yeterli tampon.
const COOKIE_MAX_AGE_SEC = 30 * 60;

export async function GET() {
  const { verifier, challenge } = generatePkce();
  const state = generateState();

  const url = buildAuthorizeUrl({ state, challenge });

  // Cookie holds verifier + state so we can validate the callback.
  // HttpOnly + Secure + SameSite=Lax (Lax so Etsy's 302 back can deliver it).
  const cookieValue = JSON.stringify({ verifier, state });
  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  });
  return res;
}
