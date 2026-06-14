import type { BusinessProfileOverride } from '@/types';
import { listOverrides } from '@/lib/db/queries/kleinanzeigen';

const LLMS_URL = process.env.KLEINANZEIGEN_PROFILE_URL ?? 'https://fly-froth.com/llms.txt';
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  text: string;
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;

export function clearProfileCache(): void {
  _cache = null;
}

export async function fetchLlmsTxt(): Promise<string> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL_MS) {
    return _cache.text;
  }
  const res = await fetch(LLMS_URL, { cache: 'no-store' });
  if (!res.ok) {
    if (_cache) return _cache.text;
    throw new Error(`llms.txt fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  _cache = { text, fetchedAt: Date.now() };
  return text;
}

export function buildMergedProfile(
  llmsTxt: string,
  overrides: BusinessProfileOverride[],
): string {
  if (overrides.length === 0) return llmsTxt;
  const lines: string[] = [
    llmsTxt.trimEnd(),
    '',
    '## Zusätzliche Hinweise (interne Overrides)',
    '',
  ];
  for (const o of overrides) {
    const label =
      o.kind === 'not_offered' ? `[NICHT ANGEBOTEN] ${o.topic}`
      : o.kind === 'tone' ? `[TON] ${o.topic}`
      : o.kind === 'signature' ? `[SIGNATUR]`
      : `[${o.topic}]`;
    lines.push(`- ${label}: ${o.content.replace(/\n/g, ' ')}`);
  }
  return lines.join('\n');
}

export async function loadMergedProfile(): Promise<string> {
  const [text, overrides] = await Promise.all([fetchLlmsTxt(), listOverrides()]);
  return buildMergedProfile(text, overrides);
}
