/**
 * google-trends.ts — Sprint K Faz 5
 *
 * Google Trends üzerinden niche keyword araştırması (ÜCRETSIZ).
 *
 * Kullanım:
 *   const data = await getNicheTrends('books', { geo: 'US' });
 *   data.rising → en hızlı büyüyen related queries (örn. "BookTok books 2026")
 *   data.top    → en popüler related queries (genel top 25)
 *
 * Apparel design için ideal kullanım: rising queries → t-shirt slogan ipucu.
 */

// google-trends-api type-yok, manuel typed wrapper
// eslint-disable-next-line @typescript-eslint/no-require-imports
const googleTrends = require('google-trends-api') as {
  relatedQueries: (opts: { keyword: string; startTime?: Date; geo?: string }) => Promise<string>;
  relatedTopics: (opts: { keyword: string; startTime?: Date; geo?: string }) => Promise<string>;
  interestOverTime: (opts: { keyword: string; startTime?: Date; geo?: string }) => Promise<string>;
};

export interface TrendQuery {
  query: string;
  value: number;   // 0-100 popularity score
  formattedValue?: string;
}

export interface NicheTrendsResult {
  niche: string;
  geo: string;
  fetchedAt: string;
  rising: TrendQuery[];   // en hızlı büyüyenler (apparel için altın)
  top:    TrendQuery[];   // en popüler related queries
  rawRisingCount: number;
  rawTopCount: number;
}

/** Geçen 90 gün için related queries — apparel trend için ideal pencere. */
export async function getNicheTrends(
  niche: string,
  opts: { geo?: string; days?: number } = {},
): Promise<NicheTrendsResult> {
  const geo = opts.geo ?? 'US';
  const days = opts.days ?? 90;
  const startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const raw = await googleTrends.relatedQueries({
    keyword: niche,
    startTime,
    geo,
  });

  // Google Trends API JSON string döndürür, parse et
  let parsed: {
    default: {
      rankedList: Array<{
        rankedKeyword: Array<{
          query: string;
          value: number;
          formattedValue?: string;
        }>;
      }>;
    };
  };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Google Trends parse fail: ${err instanceof Error ? err.message : String(err)}`);
  }

  // rankedList[0] = top, rankedList[1] = rising (Google Trends convention)
  const rankedList = parsed?.default?.rankedList ?? [];
  const topRaw = rankedList[0]?.rankedKeyword ?? [];
  const risingRaw = rankedList[1]?.rankedKeyword ?? [];

  // Filter düşük value (noise) + slice top 25
  const top = topRaw
    .filter((k) => k.value > 0)
    .slice(0, 25)
    .map((k) => ({ query: k.query, value: k.value, formattedValue: k.formattedValue }));
  const rising = risingRaw
    .slice(0, 25)
    .map((k) => ({ query: k.query, value: k.value, formattedValue: k.formattedValue }));

  return {
    niche,
    geo,
    fetchedAt: new Date().toISOString(),
    rising,
    top,
    rawRisingCount: risingRaw.length,
    rawTopCount: topRaw.length,
  };
}
