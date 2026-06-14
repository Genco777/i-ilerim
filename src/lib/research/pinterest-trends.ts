/**
 * pinterest-trends.ts — Sprint K Faz 5
 *
 * Pinterest API v5 trends endpoint — bölgesel trending keywords.
 *
 * Pinterest trend'leri Etsy apparel için çok değerli çünkü Pinterest user'ları
 * Etsy'ye yüksek conversion ile geçer (visual discovery → purchase intent).
 *
 * Endpoint: GET /v5/trends/keywords/{region}/top/{trend_type}
 *   - region: US, GB, DE, AU, CA, FR, IT, JP, BR, MX
 *   - trend_type: growing | monthly | yearly | seasonal
 *
 * Auth: Bearer (PINTEREST_ACCESS_TOKEN env — Sprint H'de eklendi)
 */

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

export interface PinterestTrend {
  keyword: string;
  /** Trend score (Pinterest internal — yüksek = popüler) */
  pct_growth_wow?: number;   // week-over-week
  pct_growth_mom?: number;   // month-over-month
  pct_growth_yoy?: number;   // year-over-year
  /** Hafta/ay/yıl bazlı raw search volume estimate */
  time_series?: Record<string, number>;
}

export interface PinterestTrendsResult {
  region: string;
  trendType: 'growing' | 'monthly' | 'yearly' | 'seasonal';
  fetchedAt: string;
  trends: PinterestTrend[];
  warning?: string;
}

function getToken(): string {
  const t = process.env.PINTEREST_ACCESS_TOKEN;
  if (!t) throw new Error('PINTEREST_ACCESS_TOKEN env yok — Pinterest OAuth flow tamamlanmadı (Sprint H)');
  return t;
}

/** Trending keywords — varsayılan growing (haftalık en hızlı büyüyenler). */
export async function getPinterestTrends(opts: {
  region?: string;
  trendType?: 'growing' | 'monthly' | 'yearly' | 'seasonal';
  /** Filter — keyword bu kelimeyi içermeli (case-insensitive) */
  containsKeyword?: string;
} = {}): Promise<PinterestTrendsResult> {
  const region    = opts.region ?? 'US';
  const trendType = opts.trendType ?? 'growing';
  const url = `${PINTEREST_API_BASE}/trends/keywords/${region}/top/${trendType}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'User-Agent': 'fly-froth-social/1.0',
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    // 403/401 = token sorunu, 400 = bölge desteklenmiyor
    return {
      region,
      trendType,
      fetchedAt: new Date().toISOString(),
      trends: [],
      warning: `Pinterest API ${res.status}: ${txt.slice(0, 250)}`,
    };
  }

  const body = (await res.json()) as { trends?: PinterestTrend[] };
  let trends = body.trends ?? [];

  if (opts.containsKeyword) {
    const needle = opts.containsKeyword.toLowerCase();
    trends = trends.filter((t) => t.keyword.toLowerCase().includes(needle));
  }

  return {
    region,
    trendType,
    fetchedAt: new Date().toISOString(),
    trends: trends.slice(0, 50), // top 50 yeter
  };
}
