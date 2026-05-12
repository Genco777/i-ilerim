/**
 * Sync GOOGLE_ADS_* env vars from .env.local to Vercel.
 *
 * Reads .env.local, finds every GOOGLE_ADS_* key, and pushes each one
 * to Vercel for production + preview + development environments via the
 * Vercel CLI. Requires `vercel login` already completed and the project
 * to be linked (.vercel/project.json exists).
 *
 * Usage:
 *   pnpm sync:vercel-env
 */
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

const ENV_FILE = '.env.local';
const ENVS = ['production', 'preview', 'development'] as const;

if (!existsSync(ENV_FILE)) {
  console.error(`❌ ${ENV_FILE} not found. Create it first with GOOGLE_ADS_* keys.`);
  process.exit(1);
}

if (!existsSync(join('.vercel', 'project.json'))) {
  console.error('❌ .vercel/project.json missing. Run `vercel link` first.');
  process.exit(1);
}

config({ path: ENV_FILE });

const KEYS = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
] as const;

function runVercel(args: string[], stdin?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
    const proc = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (out += d.toString()));
    proc.on('close', (code) => resolve({ code: code ?? 0, out }));
    if (stdin !== undefined) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }
  });
}

async function envExists(key: string, env: string): Promise<boolean> {
  const { out } = await runVercel(['env', 'ls', env]);
  // Match the key at the start of any line (Vercel CLI's table format)
  const re = new RegExp(`^\\s*${key}\\b`, 'm');
  return re.test(out);
}

async function removeEnv(key: string, env: string): Promise<void> {
  await runVercel(['env', 'rm', key, env, '--yes']);
}

async function addEnv(key: string, value: string, env: string): Promise<void> {
  const { code, out } = await runVercel(['env', 'add', key, env], value + '\n');
  if (code !== 0) {
    throw new Error(`vercel env add ${key} ${env} failed:\n${out}`);
  }
}

async function main() {
  const missing: string[] = [];
  for (const k of KEYS) {
    if (k === 'GOOGLE_ADS_LOGIN_CUSTOMER_ID') continue; // optional
    if (!process.env[k]) missing.push(k);
  }
  if (missing.length) {
    console.error(`❌ Missing in ${ENV_FILE}: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log('Syncing GOOGLE_ADS_* env vars to Vercel…\n');
  for (const key of KEYS) {
    const value = process.env[key];
    if (!value) {
      console.log(`  - ${key}: skipped (not set, optional)`);
      continue;
    }
    for (const env of ENVS) {
      process.stdout.write(`  • ${key} → ${env}: `);
      if (await envExists(key, env)) {
        await removeEnv(key, env);
        process.stdout.write('(replaced) ');
      }
      await addEnv(key, value, env);
      console.log('OK');
    }
  }
  console.log('\n✓ All env vars synced.');
  console.log('\nNext: redeploy so the running bot picks up the changes:');
  console.log('  vercel --prod\n');
}

main().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
