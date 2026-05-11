import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchLlmsTxt,
  buildMergedProfile,
  clearProfileCache,
} from '@/lib/kleinanzeigen/profile';

const SAMPLE = `# Fly & Froth

> Strategisches Grafikdesign.

## Leistungen

- Logodesign: ab 79 €.
`;

describe('fetchLlmsTxt', () => {
  beforeEach(() => {
    clearProfileCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches llms.txt and returns its text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE, { status: 200 })));
    const text = await fetchLlmsTxt();
    expect(text).toBe(SAMPLE);
  });

  it('uses cached value on second call within TTL', async () => {
    const f = vi.fn(async () => new Response(SAMPLE, { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fetchLlmsTxt();
    await fetchLlmsTxt();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws on non-2xx response when no cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(fetchLlmsTxt()).rejects.toThrow(/404/);
  });

  it('returns stale cache on non-2xx when cache is populated', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE, { status: 200 })));
    await fetchLlmsTxt();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 503 })));
    const text = await fetchLlmsTxt();
    expect(text).toBe(SAMPLE);
  });
});

describe('buildMergedProfile', () => {
  it('includes llms.txt body and override entries', () => {
    const merged = buildMergedProfile(SAMPLE, [
      {
        id: 'a',
        topic: 'animation',
        kind: 'offered',
        content: 'Animation ab 60€, +3-5 Tage Lieferzeit.',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'b',
        topic: 'signature',
        kind: 'signature',
        content: 'Liebe Grüße,\nMehmet',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    expect(merged).toContain(SAMPLE);
    expect(merged).toContain('animation');
    expect(merged).toContain('Liebe Grüße');
    expect(merged.toLowerCase()).toContain('zusätzliche');
  });

  it('omits the override block when there are no overrides', () => {
    const merged = buildMergedProfile(SAMPLE, []);
    expect(merged).toBe(SAMPLE);
  });

  it('renders distinct labels for not_offered and tone overrides', () => {
    const merged = buildMergedProfile(SAMPLE, [
      {
        id: 'a',
        topic: '3d-rendering',
        kind: 'not_offered',
        content: 'Bieten wir nicht an, höflich ablehnen.',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'b',
        topic: 'voice',
        kind: 'tone',
        content: 'lockerer als der Standard.',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    expect(merged).toContain('[NICHT ANGEBOTEN] 3d-rendering');
    expect(merged).toContain('[TON] voice');
  });
});
