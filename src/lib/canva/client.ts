/**
 * canva/client.ts
 *
 * Canva Connect API — OAuth 2.0 client with automatic token refresh.
 *
 * Setup (one-time):
 *   1. developer.canva.com → "Create an app" → Integration type: "Connect API"
 *   2. Add scopes: design:content:read, design:content:write,
 *                  asset:read, asset:write,
 *                  brandtemplate:content:read, brandtemplate:meta:read
 *   3. Set Redirect URI to: https://admin.fly-froth.com/api/canva/callback
 *   4. Copy Client ID + Client Secret → .env:
 *        CANVA_CLIENT_ID=...
 *        CANVA_CLIENT_SECRET=...
 *   5. Run: npx tsx scripts/canva-oauth.ts   (opens browser, stores tokens to DB)
 */

const BASE = 'https://api.canva.com/rest/v1';
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

export interface CanvaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix ms
}

// ── Token persistence via system-config DB ────────────────────────────────────

async function loadTokens(): Promise<CanvaTokens | null> {
  try {
    const { getSystemConfigValue } = await import('@/lib/db/queries/system-config');
    const raw = await getSystemConfigValue('canva_tokens', '');
    if (!raw) return null;
    return JSON.parse(raw) as CanvaTokens;
  } catch {
    return null;
  }
}

async function saveTokens(tokens: CanvaTokens): Promise<void> {
  try {
    const { setSystemConfig } = await import('@/lib/db/queries/system-config');
    await setSystemConfig('canva_tokens', JSON.stringify(tokens));
  } catch (e) {
    console.error('[canva] failed to save tokens', e);
  }
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function refreshTokens(refreshToken: string): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID!;
  const clientSecret = process.env.CANVA_CLIENT_SECRET!;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Canva token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    expires_at: Date.now() + (data.expires_in - 60) * 1000, // 1 dk erken yenile
  };
}

// ── Access token (auto-refresh) ───────────────────────────────────────────────

export async function getCanvaAccessToken(): Promise<string> {
  let tokens = await loadTokens();
  if (!tokens) throw new Error('Canva henüz bağlanmadı. npx tsx scripts/canva-oauth.ts çalıştır.');

  if (Date.now() >= tokens.expires_at) {
    tokens = await refreshTokens(tokens.refresh_token);
    await saveTokens(tokens);
  }

  return tokens.access_token;
}

/** İlk OAuth bağlantısından gelen code ile token al ve kaydet. */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<CanvaTokens> {
  const clientId = process.env.CANVA_CLIENT_ID!;
  const clientSecret = process.env.CANVA_CLIENT_SECRET!;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`Canva code exchange failed (${res.status}): ${await res.text()}`);

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const tokens: CanvaTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };

  await saveTokens(tokens);
  return tokens;
}

// ── Base HTTP client ──────────────────────────────────────────────────────────

export async function canvaFetch(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const token = await getCanvaAccessToken();
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  });
}

export async function canvaJson<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await canvaFetch(path, opts);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body as { message?: string })?.message ?? res.statusText;
    throw new Error(`Canva API error (${res.status}) ${path}: ${msg}`);
  }
  return body as T;
}
