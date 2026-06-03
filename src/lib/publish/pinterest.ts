/**
 * Pinterest Pin API v5 — OAuth2 + create_pin.
 *
 * Why Pinterest matters for Etsy printables: 50%+ of Etsy printable traffic
 * comes from Pinterest. Every new product approved should get pinned to 1-3
 * niche-relevant boards. This is the highest free-traffic lever we have.
 *
 * Auth model:
 *   • Pinterest uses OAuth2 (NOT PKCE — uses client_secret directly).
 *   • Access tokens last 30 days; refresh tokens last 60 days (rolling).
 *   • We persist both in `secrets` table (encrypted) under keys:
 *       pinterest_access_token   (with expires_at)
 *       pinterest_refresh_token  (long-lived)
 *
 * Required scopes: boards:read, pins:read, pins:write, user_accounts:read
 *
 * Used by:
 *   src/lib/trend/approval-handlers.ts  (auto-pin on ✅ Onayla)
 *   src/app/api/auth/pinterest/start    (OAuth init)
 *   src/app/api/auth/pinterest/callback (OAuth token exchange)
 */

import { getSecret, setSecret } from '@/lib/crypto/secrets';

const PINTEREST_OAUTH_BASE = 'https://www.pinterest.com/oauth/';
const PINTEREST_TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

export const PINTEREST_SCOPES =
  'boards:read,pins:read,pins:write,user_accounts:read';

const SECRET_KEY_ACCESS = 'pinterest_access_token';
const SECRET_KEY_REFRESH = 'pinterest_refresh_token';

function getClientId(): string {
  const v = process.env.PINTEREST_APP_ID;
  if (!v) throw new Error('PINTEREST_APP_ID is not set');
  return v;
}

function getClientSecret(): string {
  const v = process.env.PINTEREST_APP_SECRET;
  if (!v) throw new Error('PINTEREST_APP_SECRET is not set');
  return v;
}

function getRedirectUri(): string {
  const v = process.env.PINTEREST_OAUTH_REDIRECT_URI;
  if (!v) throw new Error('PINTEREST_OAUTH_REDIRECT_URI is not set');
  return v;
}

// ─────────────────────────────────────────────────────────────
// OAuth2 — authorize URL + token exchange + refresh
// ─────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    scope: PINTEREST_SCOPES,
    state,
  });
  return `${PINTEREST_OAUTH_BASE}?${params.toString()}`;
}

interface PinterestTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
}

export async function exchangeCodeForToken(code: string): Promise<PinterestTokenResponse> {
  const basicAuth = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  });
  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token exchange failed: ${res.status} — ${text.slice(0, 500)}`);
  }
  return (await res.json()) as PinterestTokenResponse;
}

async function refreshAccessToken(refresh: string): Promise<PinterestTokenResponse> {
  const basicAuth = Buffer.from(`${getClientId()}:${getClientSecret()}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    scope: PINTEREST_SCOPES,
  });
  const res = await fetch(PINTEREST_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token refresh failed: ${res.status} — ${text.slice(0, 500)}`);
  }
  return (await res.json()) as PinterestTokenResponse;
}

export async function persistTokens(t: PinterestTokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(60, t.expires_in - 60) * 1000);
  await setSecret(SECRET_KEY_ACCESS, t.access_token, expiresAt);
  await setSecret(SECRET_KEY_REFRESH, t.refresh_token);
}

export async function getAccessToken(): Promise<string> {
  const stored = await getSecret(SECRET_KEY_ACCESS);
  if (stored) {
    // We don't have direct expiry check here — Pinterest will 401 if stale,
    // and we'll retry once via the wrapper.
    return stored;
  }
  const refresh = await getSecret(SECRET_KEY_REFRESH);
  if (!refresh) {
    throw new Error(
      'Pinterest not connected — visit /api/auth/pinterest/start to authorize.',
    );
  }
  const fresh = await refreshAccessToken(refresh);
  await persistTokens(fresh);
  return fresh.access_token;
}

export async function isPinterestConnected(): Promise<boolean> {
  const refresh = await getSecret(SECRET_KEY_REFRESH);
  return !!refresh;
}

// ─────────────────────────────────────────────────────────────
// Pinterest API — Boards + Pins
// ─────────────────────────────────────────────────────────────

export interface PinterestBoard {
  id: string;
  name: string;
  description: string;
  pin_count: number;
  privacy: 'PUBLIC' | 'PROTECTED' | 'SECRET';
}

export interface PinterestPin {
  id: string;
  link: string;
  title: string;
  description: string;
  board_id: string;
  created_at: string;
  media: { images: Record<string, { url: string; width: number; height: number }> };
}

async function pinterestFetch<T>(
  path: string,
  opts: { method?: string; json?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAccessToken();
  let url = `${PINTEREST_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(opts.json ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.json ? JSON.stringify(opts.json) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Pinterest ${path} failed: HTTP ${res.status} — ${text.slice(0, 500)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function listBoards(): Promise<PinterestBoard[]> {
  const res = await pinterestFetch<{ items: PinterestBoard[] }>('/boards', {
    query: { page_size: '50' },
  });
  return res.items ?? [];
}

export async function createPin(args: {
  boardId: string;
  imageUrl: string;
  title: string;
  description: string;
  link?: string;
  altText?: string;
}): Promise<PinterestPin> {
  return pinterestFetch<PinterestPin>('/pins', {
    method: 'POST',
    json: {
      board_id: args.boardId,
      title: args.title.slice(0, 100),
      description: args.description.slice(0, 500),
      alt_text: args.altText?.slice(0, 500),
      link: args.link,
      media_source: {
        source_type: 'image_url',
        url: args.imageUrl,
      },
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Niche → board selection
// ─────────────────────────────────────────────────────────────

/**
 * Pick up to 3 boards that best match a product's niche keywords. Caller
 * passes the user's full board list (cached at orchestrator scope) so we
 * don't re-list per pin.
 */
export function pickBoardsForNiche(
  boards: PinterestBoard[],
  niche: { topic: string; gapAngle: string; productHint: string },
): PinterestBoard[] {
  const haystack = `${niche.topic} ${niche.gapAngle}`.toLowerCase();
  const scored = boards
    .filter((b) => b.privacy === 'PUBLIC')
    .map((b) => {
      const text = `${b.name} ${b.description}`.toLowerCase();
      let score = 0;
      // crude relevance score: token overlap
      const haystackTokens = new Set(haystack.split(/\W+/).filter((t) => t.length >= 4));
      for (const t of text.split(/\W+/)) {
        if (haystackTokens.has(t)) score++;
      }
      return { board: b, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Always pin to top 3 by score; fall back to first 3 public if no matches.
  if (scored.length === 0) {
    return boards.filter((b) => b.privacy === 'PUBLIC').slice(0, 3);
  }
  return scored.slice(0, 3).map((s) => s.board);
}
