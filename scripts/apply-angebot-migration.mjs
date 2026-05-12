import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const migration = readFileSync(join(process.cwd(), 'drizzle/migrations/0013_angebot.sql'), 'utf8');
const statements = migration.split(';').map(s => s.trim()).filter(Boolean);

for (const stmt of statements) {
  try {
    await sql.unsafe(stmt);
    console.log('OK:', stmt.slice(0, 80));
  } catch (err) {
    // "already exists" or "duplicate" errors are safe — the value/column
    // may already be present from a previous run or manual DDL.
    const msg = err?.message ?? String(err);
    if (/already exists|duplicate|already|existiert bereits/i.test(msg)) {
      console.log('SKIP (already exists):', stmt.slice(0, 80));
    } else {
      console.error('FAIL:', stmt.slice(0, 80));
      console.error(msg);
      process.exit(1);
    }
  }
}
console.log('Migration applied.');
