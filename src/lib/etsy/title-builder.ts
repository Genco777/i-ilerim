/**
 * etsy/title-builder.ts — Sprint M2.5 Faz A
 *
 * Etsy SEO-optimized title generator. Bestseller pattern (14 Haziran 2026
 * audit'inde gözlendi):
 *   - Title: 100-140 karakter
 *   - Almanca + İngilizce karışık (DE pazarı için)
 *   - Keyword stuffed: bookworm + Bücherwurm + Buchliebhaber + Geschenk + gift
 *   - Gift angle ZORUNLU ("birthday gift for...", "Geschenk für...")
 *   - Niche-specific terms (Romantasy, Booktok, Comfort Colors, vs.)
 *
 * Algoritma:
 *   "{slogan} — {productType}, {nicheKeywords (2-3)}, {giftAngle}, {recipientHint}"
 *
 * Sonuç: 130+ char title, Etsy search algorithm bonus + DE/EU müşterileri için
 * Almanca anahtar kelimeler.
 */

import { lookupNiche } from '@/lib/research/niche-keywords';

export interface TitleBuildOpts {
  /** Ana slogan (örn. "Plot Twist Addict") */
  slogan: string;
  /** Niche key (books, coffee, dog, vs.) */
  niche: string;
  /** Ürün tipi (tshirt, hoodie, tote) */
  productType: 'tshirt' | 'hoodie' | 'tote';
  /** GPT-4o'dan gelen gift angle (varsa) — örn. "birthday gift", "occupation" */
  giftAngle?: string;
}

// Niche'a özel marketing keyword'leri (Etsy bestseller pattern'den)
const NICHE_KEYWORDS: Record<string, { en: string[]; de: string[]; trending: string[] }> = {
  books: {
    en: ['bookworm', 'book lover', 'bookish merch', 'reader gift', 'reading shirt', 'literary tee', 'comfort colors', 'booktrovert'],
    de: ['Bücherwurm', 'Buchliebhaber', 'Leseratte', 'Bookish', 'Lesegeschenk'],
    trending: ['BookTok', 'Romantasy', 'Fantasy Reader', 'Dark Academia', 'Cottagecore Bookworm'],
  },
  coffee: {
    en: ['coffee lover', 'caffeine addict', 'coffee shirt', 'barista gift', 'morning vibes'],
    de: ['Kaffeeliebhaber', 'Koffein', 'Kaffeegeschenk'],
    trending: ['Espresso Yourself', 'But First Coffee', 'Cold Brew Era'],
  },
  dog: {
    en: ['dog mom', 'dog dad', 'fur baby', 'dog lover gift', 'pup parent', 'rescue mom'],
    de: ['Hundemutter', 'Hundeliebhaber', 'Geschenk Hundebesitzer'],
    trending: ['Golden Retriever', 'Frenchie', 'Corgi Mom'],
  },
  cat: {
    en: ['cat mom', 'crazy cat lady', 'feline lover', 'kitty gift', 'cat shirt'],
    de: ['Katzenliebhaber', 'Katzenmama', 'Geschenk Katzenbesitzer'],
    trending: ['Cat Aesthetic', 'Black Cat Era', 'Cat + Books'],
  },
  yoga: {
    en: ['yoga lover', 'mindfulness gift', 'yoga teacher gift', 'zen vibes'],
    de: ['Yogagebenkin', 'Achtsamkeit'],
    trending: ['Lululemon Style', 'Yoga Aesthetic'],
  },
  plants: {
    en: ['plant mom', 'plant parent', 'green thumb', 'plant lover gift', 'botanical aesthetic'],
    de: ['Pflanzenliebhaber', 'Garten'],
    trending: ['Monstera', 'Houseplant Era', 'Cottagecore Garden'],
  },
  mom: {
    en: ['mom life', 'mama bear', 'mother gift', 'new mom', 'mama shirt'],
    de: ['Mama Shirt', 'Muttertagsgeschenk', 'Mutter Geschenk'],
    trending: ['Boy Mom', 'Girl Mom', 'Mama Era'],
  },
  teacher: {
    en: ['teacher gift', 'teacher appreciation', 'librarian gift', 'classroom shirt', 'educator'],
    de: ['Lehrer Geschenk', 'Lehrerin', 'Bibliothekar Geschenk'],
    trending: ['Last Day of School', 'Teach Love Inspire'],
  },
  nurse: {
    en: ['nurse gift', 'RN shirt', 'nurse life', 'healthcare hero'],
    de: ['Krankenschwester Geschenk', 'Pflege'],
    trending: ['ICU Nurse', 'ER Squad'],
  },
  celestial: {
    en: ['celestial shirt', 'moon lover', 'cosmic vibes', 'mystical aesthetic'],
    de: ['Himmlisch', 'Mystisch'],
    trending: ['Witchy Aesthetic', 'Tarot Era'],
  },
  travel: {
    en: ['wanderlust', 'travel lover gift', 'adventure shirt', 'explorer'],
    de: ['Reiseliebhaber', 'Abenteuer'],
    trending: ['Cottagecore Travel', 'Slow Travel'],
  },
};

// Generic gift angles (slogan'dan inspire alanlar dışında)
const DEFAULT_GIFT_ANGLES = [
  'Birthday Gift for Her',
  'Christmas Gift',
  'Funny Gift',
  'Best Friend Gift',
  'Geschenk',
];

// Product type translations
const PRODUCT_TYPE_LABELS: Record<TitleBuildOpts['productType'], { en: string; de: string }> = {
  tshirt: { en: 'T-Shirt', de: 'T-Shirt' },
  hoodie: { en: 'Hoodie', de: 'Hoodie' },
  tote: { en: 'Tote Bag', de: 'Tasche' },
};

/**
 * Etsy SEO title üret (130+ karakter, keyword-stuffed, gift-oriented).
 *
 * @param opts slogan + niche + productType + opsiyonel giftAngle
 * @returns max 140 char title (Etsy hard limit 140)
 */
export function buildEtsyTitle(opts: TitleBuildOpts): string {
  const niche = opts.niche.toLowerCase();
  const keywords = NICHE_KEYWORDS[niche] ?? NICHE_KEYWORDS.books;
  const productLabel = PRODUCT_TYPE_LABELS[opts.productType];

  // Component'ler
  const components: string[] = [];

  // 1. Slogan + product type
  components.push(`${opts.slogan} ${productLabel.en}`);

  // 2. 2 niche keyword (EN)
  const enKeywords = shuffleAndPick(keywords.en, 2);
  components.push(enKeywords.join(', '));

  // 3. 1 trending term
  const trending = shuffleAndPick(keywords.trending, 1);
  if (trending.length > 0) {
    components.push(trending[0]);
  }

  // 4. Gift angle (slogan'dan ya da default)
  const giftAngle = opts.giftAngle?.trim() || pickRandom(DEFAULT_GIFT_ANGLES);
  components.push(giftAngle);

  // 5. DE keyword (2 tane)
  const deKeywords = shuffleAndPick(keywords.de, 2);
  if (deKeywords.length > 0) {
    components.push(deKeywords.join(' '));
  }

  // Birleştir, 140 char cap
  let title = components.join(' — ');

  // Etsy max 140 char — taşarsa boyut ayarla
  if (title.length > 140) {
    title = title.slice(0, 137) + '...';
  }

  return title;
}

// ─── Helpers ─────────────────────────────────────────────────────
function shuffleAndPick<T>(arr: readonly T[], count: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Etsy SEO description üret — 200-400 karakter, gift framing + niche identity.
 * Bestseller pattern: gift box mention, premium quality mention, "perfect for X".
 */
export function buildEtsyDescription(opts: TitleBuildOpts): string {
  const niche = opts.niche.toLowerCase();
  const keywords = NICHE_KEYWORDS[niche] ?? NICHE_KEYWORDS.books;
  const productLabel = PRODUCT_TYPE_LABELS[opts.productType];

  const giftLine = opts.giftAngle?.trim()
    ? `Perfect ${opts.giftAngle.toLowerCase()} for the ${keywords.en[0]} in your life.`
    : `A thoughtful gift for the ${keywords.en[0]} in your life — birthday, Christmas, or just because.`;

  return [
    `${opts.slogan} ${productLabel.en} — designed for ${keywords.en.slice(0, 3).join(', ')}.`,
    '',
    giftLine,
    '',
    `✦ Soft, comfortable premium fabric`,
    `✦ Durable direct-to-garment print`,
    `✦ Ships from US, 5-10 business days`,
    `✦ Unisex sizing — XS to 3XL available`,
    '',
    `Designed in our studio in Karben, Germany.`,
    `— Fly & Froth Studio`,
  ].join('\n');
}

/**
 * 13 Etsy tag öner (max 20 char each).
 * Bestseller pattern: mix EN + DE + niche-specific + gift keywords.
 */
export function buildEtsyTags(opts: TitleBuildOpts): string[] {
  const niche = opts.niche.toLowerCase();
  const keywords = NICHE_KEYWORDS[niche] ?? NICHE_KEYWORDS.books;

  const candidates: string[] = [
    // Core niche (EN + DE)
    ...keywords.en.slice(0, 3),
    ...keywords.de.slice(0, 2),
    // Trending
    ...keywords.trending.slice(0, 2),
    // Gift keywords
    'gift for her',
    'birthday gift',
    'Geschenk',
    // Product type
    opts.productType === 'tote' ? 'canvas tote' : 'graphic tee',
    // Generic
    'fly and froth',
  ];

  // Dedupe + Etsy tag char limit (20)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of candidates) {
    const trimmed = tag.slice(0, 20).trim().toLowerCase();
    if (!seen.has(trimmed) && trimmed.length > 0) {
      seen.add(trimmed);
      result.push(tag.slice(0, 20));
    }
    if (result.length >= 13) break;
  }
  return result;
}

// Re-export for testing
export { NICHE_KEYWORDS };
