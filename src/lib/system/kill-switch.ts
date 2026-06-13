/**
 * Sistem genel kill switch — Mehmet Telegram'dan /durdur / /baslat ile kontrol eder.
 *
 * DB key: system_config.system_paused = "true" | "false" (default false)
 *
 * Etki: trend-discovery + trend-discovery-poster + social-daily-digest +
 * reviews-ask + cart-abandon-followup + title-rotate başında kontrol edilir.
 *
 * NOT etkilenen: telegram webhook (kapatsam kontrol edemezsin), poll-inbox,
 * agent-watchdog (sistem sağlığı için lazım), market-scan (haftalık, ucuz).
 */

import { getSystemConfigValue, setSystemConfig } from '@/lib/db/queries/system-config';

const KEY = 'system_paused';

export async function isSystemPaused(): Promise<boolean> {
  try {
    const v = await getSystemConfigValue(KEY, 'false');
    return v === 'true' || v === '1';
  } catch {
    return false; // DB fail durumunda sistem çalışsın (false-fail)
  }
}

export async function setSystemPaused(paused: boolean, by: string): Promise<void> {
  await setSystemConfig(KEY, paused ? 'true' : 'false');
  await setSystemConfig(`${KEY}_meta`, JSON.stringify({
    changed_at: new Date().toISOString(),
    changed_by: by,
    state: paused ? 'paused' : 'running',
  }));
}

export async function getPauseMeta(): Promise<{
  paused: boolean;
  changed_at?: string;
  changed_by?: string;
}> {
  const paused = await isSystemPaused();
  try {
    const raw = await getSystemConfigValue(`${KEY}_meta`, '');
    if (!raw) return { paused };
    const meta = JSON.parse(raw) as { changed_at?: string; changed_by?: string };
    return { paused, ...meta };
  } catch {
    return { paused };
  }
}
