/**
 * Etsy Open API v3 — OAuth2 PKCE client + authenticated fetch wrapper.
 *
 * Token persistence: encrypted in `secrets` table via lib/crypto/secrets.ts.
 * Keys used:
 *   etsy_access_token   (expires per API response, refresh before)
 *   etsy_refresh_token  (long-lived; 90 days per Etsy docs)
 *
 * Auth model: every Etsy request needs BOTH:
 *   - x-api-key: ETSY_API_KEYSTRING (always)
 *   - Authorization: Bearer <access_token> (for OAuth-protected endpoints)
 *
 * Token refresh: if access token expires within 60 s, refresh first.
 *
 * Used by:
 *   src/lib/publish/etsy.adapter.ts          (listing create + upload)
 *   src/app/api/auth/etsy/start/route.ts     (initiate OAuth)
 *   src/app/api/auth/etsy/callback/route.ts  (token exchange)
 */

import crypto from 'node:crypto';
import { getSecret, setSecret } from '@/lib/crypto/secrets';

// ─────────────────────────────────────────────────────────────
// Environment + constants
// ─────────────────────────────────────────────────────────────

const ETSY_OAUTH_AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';
const ETSY_OAUTH_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const ETSY_API_BASE = 'https://api.etsy.com/v3';

/**
 * Scopes for listing automation + sales tracking. Read scopes are cheap
 * but make our error logs more informative ("you don't own this listing"
 * vs. "scope denied"). transactions_r unlocks future Etsy sales sync.
 */
export const ETSY_SCOPES = [
  'listings_w',
  'listings_r',
  'listings_d',
  'shops_r',
  'shops_w',
  'transactions_r',
  'profile_r',
  'email_r',
].join(' ');

function getKeystring(): string {
  const k = process.env.ETSY_API_KEYSTRING;
  if (!k) throw new Error('ETSY_API_KEYSTRING is not set');
  return k;
}

export function getEtsyShopId(): number {
  const s = process.env.ETSY_SHOP_ID;
  if (!s) throw new Error('ETSY_SHOP_ID is not set');
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`ETSY_SHOP_ID is not a valid number: ${s}`);
  }
  return n;
}

function getRedirectUri(): string {
  const u = process.env.ETSY_OAUTH_REDIRECT_URI;
  if (!u) throw new Error('ETSY_OAUTH_REDIRECT_URI is not set');
  return u;
}

// ─────────────────────────────────────────────────────────────
// PKCE — code verifier + S256 challenge
// ─────────────────────────────────────────────────────────────

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** RFC 7636 PKCE. Verifier 43-128 chars; we use 64 bytes → 86 base64url chars. */
export function generatePkce(): PkcePair {
  const verifier = crypto.randomBytes(64).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

/** Cryptographic state nonce — short opaque string for CSRF protection. */
export function generateState(): string {
  return crypto.randomBytes(24).toString('base64url');
}

// ─────────────────────────────────────────────────────────────
// OAuth2 URL builder + token exchange
// ─────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(args: {
  state: string;
  challenge: string;
  scopes?: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getKeystring(),
    redirect_uri: getRedirectUri(),
    scope: args.scopes ?? ETSY_SCOPES,
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: 'S256',
  });
  return `${ETSY_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

interface EtsyTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number; // seconds
  refresh_token: string;
}

/** Exchange authorization code for first access+refresh token pair. */
export async function exchangeCodeForToken(args: {
  code: string;
  verifier: string;
}): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getKeystring(),
    redirect_uri: getRedirectUri(),
    code: args.code,
    code_verifier: args.verifier,
  });

  const res = await fetch(ETSY_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token exchange failed: ${res.status} — ${text.slice(0, 500)}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}

/** Refresh access token using the stored refresh_token. */
export async function refreshAccessToken(refresh_token: string): Promise<EtsyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: getKeystring(),
    refresh_token,
  });

  const res = await fetch(ETSY_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token refresh failed: ${res.status} — ${text.slice(0, 500)}`);
  }
  return (await res.json()) as EtsyTokenResponse;
}

// ─────────────────────────────────────────────────────────────
// Token persistence (secrets table, encrypted)
// ─────────────────────────────────────────────────────────────

const SECRET_KEY_ACCESS = 'etsy_access_token';
const SECRET_KEY_REFRESH = 'etsy_refresh_token';

/** Persist both tokens (access with expiry, refresh long-lived). */
export async function persistTokens(t: EtsyTokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(60, t.expires_in - 30) * 1000);
  await setSecret(SECRET_KEY_ACCESS, t.access_token, expiresAt);
  // Refresh tokens don't expire per request but Etsy rotates them after ~90d.
  // We don't set expires_at here so manual rotation is detected only on refresh failure.
  await setSecret(SECRET_KEY_REFRESH, t.refresh_token);
}

/**
 * Return a usable access token. Auto-refresh when missing or within 60 s of
 * expiry. Throws if no refresh token is stored (OAuth never completed) or if
 * the refresh call fails (token rotated/revoked → user must re-authorize).
 */
export async function getAccessToken(): Promise<string> {
  // First try the stored access token + its expiry from the secrets row.
  // (secrets.expires_at is in the DB; getSecret only returns the value, so we
  //  do a direct check via setSecret semantics: if it's still present, it's
  //  not yet been auto-evicted. We additionally pre-refresh below.)
  const stored = await getSecret(SECRET_KEY_ACCESS);
  if (stored) {
    // We have an access token. Check its DB expiry directly.
    const expiry = await getAccessTokenExpiry();
    if (expiry && expiry.getTime() > Date.now() + 60_000) {
      return stored;
    }
  }

  // Need to refresh.
  const refresh = await getSecret(SECRET_KEY_REFRESH);
  if (!refresh) {
    throw new Error(
      'Etsy not connected — no refresh token. Visit /api/auth/etsy/start to authorize.',
    );
  }
  const fresh = await refreshAccessToken(refresh);
  await persistTokens(fresh);
  return fresh.access_token;
}

/** Returns the access token's DB expires_at (or null if no row). */
async function getAccessTokenExpiry(): Promise<Date | null> {
  const { db } = await import('@/lib/db');
  const { sql } = await import('drizzle-orm');
  const result = await db.execute(sql`
    SELECT expires_at FROM secrets WHERE key = ${SECRET_KEY_ACCESS}
  `);
  const rows =
    (result as unknown as { rows: { expires_at: string | null }[] }).rows ??
    (result as unknown as { expires_at: string | null }[]);
  const v = rows[0]?.expires_at;
  return v ? new Date(v) : null;
}

/** True iff a refresh token is present — i.e., OAuth has been completed once. */
export async function isEtsyConnected(): Promise<boolean> {
  const refresh = await getSecret(SECRET_KEY_REFRESH);
  return !!refresh;
}

// ─────────────────────────────────────────────────────────────
// Authenticated fetch wrapper
// ─────────────────────────────────────────────────────────────

export interface EtsyFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  query?: Record<string, string | number | boolean | undefined>;
  /** application/json body — will be JSON.stringified */
  json?: unknown;
  /** application/x-www-form-urlencoded body */
  form?: Record<string, string | number | undefined>;
  /** Raw body (for multipart) — caller sets content-type */
  rawBody?: BodyInit;
  rawHeaders?: Record<string, string>;
}

/**
 * Authenticated request to /v3/application/* endpoints. Sends both
 * x-api-key (keystring) and Authorization: Bearer (access token).
 *
 * Auto-refreshes on 401 once (in case the cached expiry was wrong).
 */
export async function etsyFetch<T = unknown>(
  path: string,
  opts: EtsyFetchOptions = {},
): Promise<T> {
  const access = await getAccessToken();
  const res = await rawEtsyFetch(path, opts, access);
  if (res.status !== 401) {
    return parseOrThrow<T>(res, path);
  }
  // Force-refresh once.
  const refresh = await getSecret(SECRET_KEY_REFRESH);
  if (!refresh) {
    throw new Error('Etsy 401 + no refresh token — re-authorize at /api/auth/etsy/start');
  }
  const fresh = await refreshAccessToken(refresh);
  await persistTokens(fresh);
  const retry = await rawEtsyFetch(path, opts, fresh.access_token);
  return parseOrThrow<T>(retry, path);
}

async function rawEtsyFetch(
  path: string,
  opts: EtsyFetchOptions,
  access: string,
): Promise<Response> {
  let url = `${ETSY_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const headers: Record<string, string> = {
    'x-api-key': getKeystring(),
    authorization: `Bearer ${access}`,
    ...(opts.rawHeaders ?? {}),
  };

  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    const fb = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.form)) {
      if (v !== undefined && v !== null) fb.set(k, String(v));
    }
    body = fb.toString();
  } else if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  }

  return fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
  });
}

async function parseOrThrow<T>(res: Response, path: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Etsy ${path} failed: HTTP ${res.status} — ${text.slice(0, 800)}`,
    );
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
