// Run once after deployment:
//   pnpm dlx tsx scripts/setup-page-token.ts "<FB_PAGE_TOKEN_LONG_LIVED>"
//
// Stores the long-lived FB Page Access Token (which also unlocks the
// connected IG Business account) encrypted in Postgres via pgcrypto.

import 'dotenv/config';
import { config } from 'dotenv';

// dotenv resolution: prefer .env.local (Next.js convention) then .env
config({ path: '.env.local', override: true });

import { setPageToken } from '../src/lib/meta/token-manager';

const token = process.argv[2];
if (!token) {
  console.error(
    'Usage: pnpm dlx tsx scripts/setup-page-token.ts "<FB_PAGE_TOKEN>"',
  );
  process.exit(1);
}

(async () => {
  // Long-lived Page Token derived from a long-lived User Token never
  // expires under normal use, but Vercel cron can refresh weekly.
  // Store with a 60-day far-future expiry so the alarm fires only when
  // a real rotation is missed.
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  await setPageToken(token, expiresAt);
  console.log(`Page token saved (encrypted) — length=${token.length}`);
  process.exit(0);
})().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
