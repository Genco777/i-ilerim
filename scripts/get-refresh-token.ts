/**
 * One-time script to generate a Google Ads OAuth2 refresh token.
 *
 * Usage:
 *   1. Put GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET in .env.local
 *   2. Run: pnpm get:refresh-token
 *   3. Copy the printed URL into your browser
 *   4. Sign in with the Google account that owns the Google Ads / MCC account, click "Allow"
 *   5. The refresh token is printed to the console — paste it into
 *      .env.local as GOOGLE_ADS_REFRESH_TOKEN and into Vercel env vars
 */
import { config } from 'dotenv';
import { createServer } from 'http';
import { randomBytes } from 'crypto';

config({ path: '.env.local' });
config({ path: '.env' });

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const PORT = 8765;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    '\n❌ Missing env vars. Add these to .env.local and re-run:\n' +
      '   GOOGLE_ADS_CLIENT_ID=<from Google Cloud Console>\n' +
      '   GOOGLE_ADS_CLIENT_SECRET=<from Google Cloud Console>\n',
  );
  process.exit(1);
}

const state = randomBytes(16).toString('hex');

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');
authUrl.searchParams.set('state', state);

console.log('\n🔐 Google Ads OAuth refresh-token generator');
console.log('───────────────────────────────────────────');
console.log('\nStep 1 — Copy this URL into your browser:\n');
console.log(authUrl.toString());
console.log('\nStep 2 — Sign in with the Google account that owns the MCC / Ads account.');
console.log('Step 3 — Click "Allow".');
console.log('Step 4 — The refresh token will appear here.\n');

const server = createServer(async (req, res) => {
  if (!req.url) return;
  const reqUrl = new URL(req.url, REDIRECT_URI);
  const code = reqUrl.searchParams.get('code');
  const returnedState = reqUrl.searchParams.get('state');
  const err = reqUrl.searchParams.get('error');

  if (err) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Auth error</h1><p>${err}</p>`);
    console.error('\n❌ OAuth error:', err);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400);
    res.end('Missing code');
    return;
  }

  if (returnedState !== state) {
    res.writeHead(400);
    res.end('State mismatch — possible CSRF, aborting.');
    console.error('\n❌ State mismatch. Aborting for safety.');
    server.close();
    process.exit(1);
  }

  // Exchange the code for tokens
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const body = (await tokenRes.json()) as {
      refresh_token?: string;
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || body.error) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Token exchange failed</h1><pre>${JSON.stringify(body, null, 2)}</pre>`);
      console.error('\n❌ Token exchange failed:', body);
      server.close();
      process.exit(1);
    }

    if (!body.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<h1>No refresh token returned</h1><p>Re-run after deleting the app from https://myaccount.google.com/permissions — Google only returns a refresh_token on first consent.</p>',
      );
      console.error(
        '\n❌ No refresh_token in response. Go to https://myaccount.google.com/permissions, remove the "Fly Froth Ads CLI" app, then re-run this script.',
      );
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html lang="tr"><head><meta charset="utf-8"><title>Done</title>
      <style>body{font-family:system-ui,sans-serif;max-width:600px;margin:60px auto;padding:0 20px;color:#222}h1{color:#0a8}</style>
      </head><body>
      <h1>✓ Refresh token alındı</h1>
      <p>Tarayıcıyı kapatabilirsin. Token konsolda yazıyor — kopyala, <code>.env.local</code> ve Vercel'e ekle.</p>
      </body></html>
    `);

    console.log('\n✓ Refresh token obtained');
    console.log('───────────────────────────────────────────');
    console.log('GOOGLE_ADS_REFRESH_TOKEN=' + body.refresh_token);
    console.log('───────────────────────────────────────────\n');
    console.log('Next steps:');
    console.log('  1. Copy the line above to .env.local');
    console.log('  2. Add the same line to Vercel → Settings → Environment Variables');
    console.log('  3. Run: pnpm check:google-ads (after MCC + test account IDs are also set)\n');

    server.close();
    process.exit(0);
  } catch (e) {
    res.writeHead(500);
    res.end('Internal error');
    console.error('\n❌ Unexpected error:', e);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening on ${REDIRECT_URI} for the OAuth redirect…\n`);
});

// Safety: exit if the user doesn't complete the flow within 5 minutes
setTimeout(
  () => {
    console.error('\n⏱ Timed out after 5 minutes. Re-run when ready.');
    server.close();
    process.exit(1);
  },
  5 * 60 * 1000,
);
