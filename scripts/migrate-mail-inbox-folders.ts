import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL_NON_POOLING ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_NON_POOLING / DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(url);

const file = join(
  process.cwd(),
  'drizzle',
  'migrations',
  '0004_mail_inbox_folders.sql',
);
const raw = readFileSync(file, 'utf8');

const statements = raw
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

(async () => {
  for (const stmt of statements) {
    console.log('Executing:', stmt.split('\n')[0], '…');
    await sql.query(stmt);
  }
  console.log('mail_inbox folders migration applied.');
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
