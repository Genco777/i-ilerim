/**
 * Bootstrap migration tracking for a DB that was set up via db:push.
 *
 * Strategy:
 *  1. Ensure __drizzle_migrations table exists
 *  2. Mark ALL existing migrations (0000-0009) as already applied (insert their hashes)
 *     without executing them (since the DB already has those tables/columns)
 *  3. Apply only the NEW migration (0010_furry_shiva.sql)
 */
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

config({ path: '.env.local' });
config({ path: '.env' });

const url = process.env.DATABASE_URL_NON_POOLING || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_NON_POOLING or DATABASE_URL is not set');
  process.exit(1);
}

const sqlClient = neon(url);

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function query(q: string, params?: unknown[]) {
  if (params && params.length > 0) {
    return sqlClient.query(q, params);
  }
  return sqlClient.query(q);
}

async function main() {
  const migrationsDir = join(process.cwd(), 'drizzle', 'migrations');
  const journalRaw = readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8');
  const journal = JSON.parse(journalRaw);

  console.log(`Journal has ${journal.entries.length} entries`);

  // Step 1: Ensure __drizzle_migrations table exists
  await query(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  console.log('Migration tracking table ready.');

  // Step 2: Check which hashes are already recorded
  const existing = await query('SELECT hash FROM "__drizzle_migrations"');
  const existingHashes = new Set((existing as any[]).map((r: any) => r.hash));
  console.log(`Currently tracked: ${existingHashes.size} migration hashes`);

  // Step 3: The LAST migration (0010_furry_shiva) is the NEW one — apply it.
  // All previous ones (0000-0009) were applied via db:push, just record them.

  for (const entry of journal.entries) {
    const sqlFile = join(migrationsDir, `${entry.tag}.sql`);

    let fileContent: string;
    try {
      fileContent = readFileSync(sqlFile, 'utf8');
    } catch {
      console.warn(`  SKIP (no SQL file): ${entry.tag}`);
      continue;
    }

    const hash = computeHash(fileContent);

    if (existingHashes.has(hash)) {
      console.log(`  Already tracked: ${entry.tag}`);
      continue;
    }

    // Is this the last entry (the NEW migration to apply)?
    const isNew = entry.idx === journal.entries[journal.entries.length - 1].idx;

    if (!isNew) {
      // Already applied via db:push — just record the hash without executing
      console.log(`  Marking as pre-applied (db:push): ${entry.tag}`);
      await query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [hash, entry.when]
      );
      existingHashes.add(hash);
    } else {
      // This is the NEW migration — actually apply it
      console.log(`  APPLYING NEW MIGRATION: ${entry.tag}`);
      const statements = fileContent
        .split('--> statement-breakpoint')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (!stmt) continue;
        console.log(`    [${i + 1}/${statements.length}] ${stmt.substring(0, 100).replace(/\n/g, ' ')}...`);
        await query(stmt);
      }

      await query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [hash, entry.when]
      );
      existingHashes.add(hash);
      console.log(`    ✓ Applied and recorded: ${entry.tag}`);
    }
  }

  console.log('\nAll migrations processed!');

  // Verify the ads tables exist
  const verify = await query(`
    SELECT
      to_regclass('ads_campaigns') AS campaigns,
      to_regclass('ads_drafts') AS drafts,
      to_regclass('ads_preferences') AS preferences,
      to_regclass('wizard_states') AS wizard_states
  `);
  console.log('\nVerification:', (verify as any[])[0]);

  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e?.message || e);
  process.exit(1);
});
