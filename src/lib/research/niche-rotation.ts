/**
 * niche-rotation.ts — Sprint K Faz 6
 *
 * Haftanın gününe göre niche seçimi. Multi-niche stratejisi — her gün farklı
 * müşteri segmentine apparel üret.
 *
 * Pzr (0): cat
 * Pzt (1): books
 * Sal (2): coffee
 * Çrş (3): dog
 * Per (4): mom
 * Cum (5): yoga
 * Cmt (6): travel
 */

export const NICHE_ROTATION = [
  'cat',
  'books',
  'coffee',
  'dog',
  'mom',
  'yoga',
  'travel',
] as const;

export type RotatedNiche = (typeof NICHE_ROTATION)[number];

/** UTC haftagününe göre bugünün niche'i */
export function nicheForToday(date: Date = new Date()): RotatedNiche {
  return NICHE_ROTATION[date.getUTCDay()];
}

/** Cron run identifier — YYYY-MM-DD format (DB'de duplicate run önleme için) */
export function cronRunIdForToday(date: Date = new Date()): string {
  const iso = date.toISOString();
  return iso.slice(0, 10); // 2026-06-14
}
