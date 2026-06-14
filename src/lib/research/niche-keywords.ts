/**
 * niche-keywords.ts — Sprint K Faz 5.1
 *
 * Her niche için "relevant keyword" sözlüğü. Google Trends related queries'i
 * filtrelerken ve relevance scoring yaparken kullanılır.
 *
 * Google Trends related queries algoritması bazen alakasız top queries döndürür
 * (örn. "books" araması "vitamins", "cycling", "hospitals" çıkarır). LLM
 * bunları görünce kötü slogan üretir ("Vitamin B(ooks) Needed" gibi).
 *
 * Bu sözlük niche'a alakalı keyword'leri tanımlar — query bunlardan birini
 * içermezse drop edilir.
 */

export interface NicheDef {
  /** Niche'ın kendisi (canonical isim). */
  name: string;
  /** Bu niche'a alakalı tüm keyword variant'ları (case-insensitive substring match). */
  keywords: string[];
  /** Auto-theme tahmini için ipucu (illustration generator'a geçer). */
  defaultTheme: string;
}

export const NICHE_REGISTRY: Record<string, NicheDef> = {
  books: {
    name: 'books',
    keywords: [
      'book', 'books', 'reading', 'read', 'reader', 'library', 'novel', 'story',
      'stories', 'page', 'pages', 'chapter', 'chapters', 'author', 'kindle',
      'romance', 'fantasy', 'fiction', 'nonfiction', 'classic', 'classics',
      'bestseller', 'booktok', 'bookstagram', 'bookish', 'bookworm',
      'literature', 'literary', 'tropes', 'trope', 'plot', 'twist',
      // BookTok subgenres
      'fantasy romance', 'dark romance', 'enemies to lovers', 'rom com', 'romcom',
      'dark academia', 'cozy', 'cottagecore', 'fairyloot',
      // Trending authors/series (Haziran 2026)
      'judy blume', 'deenie', 'superfudge', 'elle kennedy', 'off campus',
      'colleen hoover', 'sarah j maas', 'rebecca yarros', 'fourth wing',
    ],
    defaultTheme: 'open book, vintage library, stacked books',
  },
  coffee: {
    name: 'coffee',
    keywords: [
      'coffee', 'caffeine', 'espresso', 'latte', 'cappuccino', 'mocha',
      'brew', 'brewing', 'mug', 'cup', 'barista', 'morning', 'cafe',
      'cold brew', 'coffee shop', 'starbucks', 'drip coffee', 'french press',
      'pour over', 'matcha',
    ],
    defaultTheme: 'coffee cup with steam, coffee beans, vintage cafe',
  },
  dog: {
    name: 'dog',
    keywords: [
      'dog', 'dogs', 'puppy', 'puppies', 'pup', 'paw', 'paws',
      'doggie', 'doggo', 'canine', 'pet', 'pets', 'dog mom', 'dog dad',
      'fur baby', 'rescue', 'adopt', 'shelter', 'breed', 'breeds',
      'golden retriever', 'labrador', 'corgi', 'french bulldog', 'frenchie',
      'poodle', 'dachshund', 'pomeranian',
    ],
    defaultTheme: 'cute dog silhouette, paw prints, dog face',
  },
  cat: {
    name: 'cat',
    keywords: [
      'cat', 'cats', 'kitten', 'kittens', 'kitty', 'meow', 'feline',
      'pet', 'pets', 'cat mom', 'cat dad', 'cat lady', 'persian', 'siamese',
      'tabby', 'calico', 'maine coon', 'bengal',
    ],
    defaultTheme: 'cat silhouette, lazy cat, cat face',
  },
  yoga: {
    name: 'yoga',
    keywords: [
      'yoga', 'meditation', 'meditate', 'namaste', 'zen', 'chakra', 'chakras',
      'mindful', 'mindfulness', 'asana', 'pranayama', 'lotus', 'om',
      'breathwork', 'vinyasa', 'ashtanga', 'kundalini',
    ],
    defaultTheme: 'lotus flower, yoga pose silhouette, om symbol',
  },
  plants: {
    name: 'plants',
    keywords: [
      'plant', 'plants', 'garden', 'gardening', 'botanical', 'leaf', 'leaves',
      'flora', 'foliage', 'houseplant', 'monstera', 'succulent', 'cactus',
      'fern', 'philodendron', 'pothos', 'snake plant', 'plant mom',
      'plant parent', 'green thumb',
    ],
    defaultTheme: 'monstera leaf, plant in pot, botanical foliage',
  },
  mom: {
    name: 'mom',
    keywords: [
      'mom', 'mama', 'mother', 'mommy', 'mum', 'motherhood', 'mom life',
      'momlife', 'mama bear', 'new mom', 'boy mom', 'girl mom', 'twin mom',
      'soccer mom', 'stay at home mom', 'sahm', 'working mom',
    ],
    defaultTheme: 'flowers, hearts, decorative wreath, motherhood symbols',
  },
  teacher: {
    name: 'teacher',
    keywords: [
      'teacher', 'teach', 'teaching', 'classroom', 'class', 'school',
      'student', 'students', 'educator', 'education', 'principal',
      'kindergarten', 'preschool', 'elementary', 'first grade',
      'pencil', 'apple', 'school year', 'back to school',
    ],
    defaultTheme: 'open book, apple, pencil, blackboard',
  },
  nurse: {
    name: 'nurse',
    keywords: [
      'nurse', 'nursing', 'rn', 'lvn', 'cna', 'icu', 'er nurse',
      'medical', 'medicine', 'doctor', 'healthcare', 'stethoscope',
      'caduceus', 'scrubs',
    ],
    defaultTheme: 'stethoscope, heart, medical cross, caduceus',
  },
  celestial: {
    name: 'celestial',
    keywords: [
      'sun', 'moon', 'star', 'stars', 'celestial', 'cosmic', 'galaxy',
      'universe', 'zodiac', 'astrology', 'horoscope', 'mystical',
      'witchy', 'tarot', 'crystal', 'crystals',
    ],
    defaultTheme: 'crescent moon, sun rays, stars, celestial bodies',
  },
  travel: {
    name: 'travel',
    keywords: [
      'travel', 'traveling', 'traveler', 'adventure', 'wander', 'wanderlust',
      'journey', 'explore', 'explorer', 'mountain', 'mountains', 'hiking',
      'backpack', 'passport', 'roadtrip', 'roadtrip', 'compass',
      'nomad', 'wanderer', 'vacation',
    ],
    defaultTheme: 'compass, mountain silhouette, paper plane, suitcase',
  },
};

/** Niche'ı registry'de ara (kısa form ya da alias kabul eder). */
export function lookupNiche(input: string): NicheDef | null {
  const normalized = input.trim().toLowerCase();
  if (NICHE_REGISTRY[normalized]) return NICHE_REGISTRY[normalized];
  // Alias: "book" → "books", "puppy" → "dog", vs.
  for (const def of Object.values(NICHE_REGISTRY)) {
    if (def.keywords.includes(normalized)) return def;
  }
  return null;
}

/**
 * Query'nin bu niche'a alakalı olup olmadığını söyle.
 * Match logic: query lowercase'inin herhangi bir keyword'ü içermesi.
 */
export function isQueryRelevant(query: string, niche: NicheDef | string): boolean {
  const def = typeof niche === 'string' ? lookupNiche(niche) : niche;
  if (!def) return true; // unknown niche → filter etme
  const q = query.toLowerCase();
  return def.keywords.some((kw) => q.includes(kw.toLowerCase()));
}

/**
 * Bir query listesini niche-relevance'a göre filtrele.
 * Returns: { kept, dropped } — transparency için her ikisi de döner.
 */
export function filterByRelevance(
  queries: string[],
  niche: NicheDef | string,
): { kept: string[]; dropped: string[] } {
  const def = typeof niche === 'string' ? lookupNiche(niche) : niche;
  if (!def) return { kept: queries, dropped: [] };
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const q of queries) {
    if (isQueryRelevant(q, def)) kept.push(q);
    else dropped.push(q);
  }
  return { kept, dropped };
}
