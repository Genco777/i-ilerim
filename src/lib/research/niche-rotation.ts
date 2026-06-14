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

// Sprint M2.5: Bestseller pazar analizi sonrası — spesific sub-niche'lar
// (generic değil). Etsy'de en az rekabet + en yüksek satış oranı buradan gelir.
//
// Pzr (0): cat-books    — cat + book intersection, az rekabet
// Pzt (1): romantasy    — Fourth Wing, ACOTAR fan base, en hot trend
// Sal (2): coffee       — evergreen, geniş kitle
// Çrş (3): teacher      — Lehrer/Bibliothekar gift, evergreen
// Per (4): mom          — Muttertag, birthday gift, evergreen
// Cum (5): booktrovert  — introvert + book humor, viral potential
// Cmt (6): cottagecore  — aesthetic niche, Pinterest-friendly
export const NICHE_ROTATION = [
  'cat-books',
  'romantasy',
  'coffee',
  'teacher',
  'mom',
  'booktrovert',
  'cottagecore',
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
