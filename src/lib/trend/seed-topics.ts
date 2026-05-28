/**
 * Seed topic bank for trend discovery.
 *
 * Each daily run picks a rotating subset of these as input for the
 * Claude gap-analysis pass. Add/remove freely — system rotates by
 * date so order doesn't matter.
 *
 * Categories favour printable digital products (planner / poster /
 * sticker / template) that have:
 *  - Active Etsy buyer base
 *  - Pinterest discoverability
 *  - Low production cost
 *  - Strong differentiation potential (avoid generic "wedding signs")
 */

export interface SeedTopic {
  area: string;
  audience: string;
  productHint: string; // suggested product type the niche tends to suit
}

export const SEED_TOPICS: SeedTopic[] = [
  // ── Productivity / focus ──
  { area: 'ADHD productivity', audience: 'neurodivergent adults', productHint: 'planner' },
  { area: 'time blocking for freelancers', audience: 'solo creatives', productHint: 'planner' },
  { area: 'deep work routines', audience: 'remote knowledge workers', productHint: 'template' },
  { area: 'morning routine for shift workers', audience: 'nurses, healthcare', productHint: 'planner' },

  // ── Mindfulness / mental health ──
  { area: 'shadow work prompts', audience: 'spiritual self-improvers', productHint: 'planner' },
  { area: 'somatic therapy worksheets', audience: 'trauma-aware adults', productHint: 'planner' },
  { area: 'daily gratitude minimalist', audience: 'overstimulated office workers', productHint: 'planner' },
  { area: 'anxiety coping cards', audience: 'young adults with anxiety', productHint: 'sticker' },

  // ── Students / academics ──
  { area: 'PhD thesis tracker', audience: 'doctoral students', productHint: 'template' },
  { area: 'med school study schedule', audience: 'pre-med, med students', productHint: 'planner' },
  { area: 'language learning sprint', audience: 'self-taught language learners', productHint: 'planner' },

  // ── Home / family ──
  { area: 'meal planning gluten-free', audience: 'celiac families', productHint: 'planner' },
  { area: 'minimalist home inventory', audience: 'declutterers', productHint: 'template' },
  { area: 'homeschool weekly rhythm', audience: 'homeschool parents', productHint: 'planner' },
  { area: 'family cleaning roster', audience: 'busy parents', productHint: 'poster' },

  // ── Creative / hobby ──
  { area: 'reading challenge tracker', audience: 'BookTok readers', productHint: 'planner' },
  { area: 'sketchbook prompts 30-day', audience: 'amateur illustrators', productHint: 'template' },
  { area: 'plant care journal', audience: 'urban plant parents', productHint: 'planner' },
  { area: 'sourdough baking log', audience: 'home bakers', productHint: 'planner' },

  // ── Wall art / posters ──
  { area: 'affirmation poster minimalist', audience: 'WFH home office', productHint: 'poster' },
  { area: 'apartment-friendly art', audience: 'renters, dorms', productHint: 'poster' },

  // ── Business / freelance ──
  { area: 'freelancer client onboarding', audience: 'designer/copywriter freelancers', productHint: 'template' },
  { area: 'etsy shop launch checklist', audience: 'new sellers', productHint: 'template' },

  // ── Niche health ──
  { area: 'PCOS symptom tracker', audience: 'women with PCOS', productHint: 'planner' },
  { area: 'migraine trigger log', audience: 'chronic migraine sufferers', productHint: 'planner' },
  { area: 'perimenopause symptom journal', audience: 'women 40-55', productHint: 'planner' },
];

/**
 * Picks a date-rotated subset of seeds so each daily run sees
 * different topics but the rotation is deterministic per day.
 */
export function pickSeedsForDate(date: Date, count: number): SeedTopic[] {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const start = (dayOfYear * 3) % SEED_TOPICS.length;
  const out: SeedTopic[] = [];
  for (let i = 0; i < count; i++) {
    out.push(SEED_TOPICS[(start + i) % SEED_TOPICS.length]!);
  }
  return out;
}
