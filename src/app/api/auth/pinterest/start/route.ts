/**
 * GET /api/auth/pinterest/start
 *
 * Initiates Pinterest OAuth2. Stores state in an HTTP-only cookie for CSRF
 * protection. 302s to Pinterest's authorize URL.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { buildAuthorizeUrl } from '@/lib/publish/pinterest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE_NAME = 'pinterest_oauth_state';

export async function GET() {
  const state = crypto.randomBytes(24).toString('base64url');
  const url = buildAuthorizeUrl(state);
  const res = NextResponse.redirect(url, { status: 302 });
  res.cookies.set(COOKIE_NAME, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
