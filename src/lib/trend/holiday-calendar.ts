/**
 * Sprint E — Holiday Calendar
 *
 * Knows when major shopping events happen. Discovery uses this to:
 *   1. Inject "upcoming event in N days" into the Claude gap-analysis prompt
 *      so the model considers seasonal angles automatically.
 *   2. Score-boost niches that fall within the prep window of an event
 *      (60-90 days before the date, when Etsy SEO indexing matters most).
 *
 * Key insight: top sellers prep 60-90 days before the spike. We do the same
 * so our listings are indexed and ranking by the time the spike hits.
 *
 * Strategy: 2027 Planner sezonu Temmuz başında başlar; biz Haziran 5'iz —
 * yani şu an 2027 planner discovery'sini ekleyip Temmuz peak'ine
 * indexlenmeye hazırız.
 */

export interface HolidayEvent {
  /** ISO date string YYYY-MM-DD when the event peaks. */
  date: string;
  /** Short label for the event. */
  label: string;
  /** Days BEFORE the event we should be promoting/launching products. */
  windowDays: number;
  /** Product types this event tends to suit best. */
  productHints: Array<'planner' | 'poster' | 'sticker' | 'template' | 'social_template'>;
  /** Keywords Claude should consider for this event. */
  keywords: string[];
}

export const HOLIDAYS_2026_2027: HolidayEvent[] = [
  // Q3 2026 — back-to-school + early Q4
  {
    date: '2026-08-15',
    label: 'Back to School',
    windowDays: 60,
    productHints: ['planner', 'template', 'sticker'],
    keywords: ['student planner', 'teacher planner', 'school supplies', 'lesson planner', 'homework tracker'],
  },
  {
    date: '2026-10-31',
    label: 'Halloween',
    windowDays: 50,
    productHints: ['poster', 'sticker', 'planner'],
    keywords: ['halloween printable', 'spooky decor', 'gothic art', 'witch aesthetic', 'pumpkin art'],
  },
  {
    date: '2026-11-26',
    label: 'Thanksgiving',
    windowDays: 30,
    productHints: ['poster', 'planner', 'template'],
    keywords: ['gratitude journal', 'thanksgiving art', 'gather sign', 'family planner'],
  },
  {
    date: '2026-11-27',
    label: 'Black Friday / Cyber Monday',
    windowDays: 21,
    productHints: ['planner', 'poster', 'template'],
    keywords: ['bestseller', 'gift idea', 'last chance', 'holiday gift'],
  },

  // Q4 2026 — Christmas + year-end
  {
    date: '2026-12-25',
    label: 'Christmas',
    windowDays: 90,
    productHints: ['planner', 'poster', 'sticker', 'template'],
    keywords: ['christmas planner', 'holiday printable', 'family christmas', 'christmas gift', 'advent calendar', 'gift tags', 'wishlist'],
  },

  // Q1 2027 — 2027 Planner season (CRITICAL — Temmuz peak)
  {
    date: '2027-01-01',
    label: '2027 Planner Season',
    windowDays: 180, // 6 months ahead — Etsy indexing for 2027 planner needs to start NOW
    productHints: ['planner', 'template'],
    keywords: ['2027 planner', '2027 goal planner', '2027 yearly planner', 'new year planner', 'goal setting 2027', 'habit tracker 2027', 'monthly planner 2027', 'weekly planner 2027', '2027 calendar', '2027 vision board'],
  },
  {
    date: '2027-02-14',
    label: "Valentine's Day",
    windowDays: 45,
    productHints: ['poster', 'sticker', 'template'],
    keywords: ['valentine card', 'love quote', 'couple print', 'romance art', 'galentine'],
  },
  {
    date: '2027-03-08',
    label: "International Women's Day",
    windowDays: 30,
    productHints: ['poster'],
    keywords: ['feminist quote', 'empowerment art', 'female founders', 'women in business'],
  },
  {
    date: '2027-04-05',
    label: 'Easter',
    windowDays: 45,
    productHints: ['poster', 'sticker', 'template'],
    keywords: ['easter printable', 'spring decor', 'easter eggs', 'bunny art', 'family easter'],
  },
  {
    date: '2027-05-10',
    label: "Mother's Day",
    windowDays: 45,
    productHints: ['poster', 'template'],
    keywords: ['mothers day gift', 'mom quote', 'family portrait', 'mom personalised', 'birth flower'],
  },
  {
    date: '2027-06-15',
    label: 'Graduation + Father\'s Day',
    windowDays: 45,
    productHints: ['poster', 'template'],
    keywords: ['graduation gift', 'fathers day', 'class of 2027', 'dad quote', 'memorabilia print'],
  },
  // Wedding season — year-round really, but spring/summer peak
  {
    date: '2027-06-01',
    label: 'Wedding Season Peak',
    windowDays: 120,
    productHints: ['template', 'poster'],
    keywords: ['wedding planner', 'wedding sign', 'wedding invite', 'bachelorette', 'rsvp card', 'seating chart'],
  },
];

export interface UpcomingEvent {
  event: HolidayEvent;
  daysUntil: number;
  inWindow: boolean;
}

/**
 * Returns the next 3 upcoming events from the perspective of `now`.
 * Events that have already passed are skipped.
 */
export function getUpcomingEvents(now: Date = new Date(), count = 3): UpcomingEvent[] {
  const upcoming: UpcomingEvent[] = [];
  for (const event of HOLIDAYS_2026_2027) {
    const eventDate = new Date(event.date + 'T00:00:00Z');
    const daysUntil = Math.floor(
      (eventDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (daysUntil < 0) continue; // already past
    upcoming.push({
      event,
      daysUntil,
      inWindow: daysUntil <= event.windowDays,
    });
  }
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  return upcoming.slice(0, count);
}

/**
 * Score boost a niche when its keywords overlap an active holiday window.
 * Returns 0-30 points to add. Compatible with our existing 0-100 niche
 * scoring scale.
 */
export function scoreHolidayBoost(
  topic: string,
  productHint: string,
  now: Date = new Date(),
): number {
  const upcoming = getUpcomingEvents(now, 5);
  const lower = topic.toLowerCase();
  let boost = 0;

  for (const u of upcoming) {
    if (!u.inWindow) continue;
    if (!u.event.productHints.includes(productHint as HolidayEvent['productHints'][number])) continue;

    // Keyword overlap check
    const hits = u.event.keywords.filter((kw) =>
      lower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(lower),
    );
    if (hits.length === 0) continue;

    // Closer events get bigger boost (linear up to +30 at 0 days)
    const urgency = 1 - u.daysUntil / u.event.windowDays;
    boost = Math.max(boost, Math.round(30 * urgency));
  }

  return boost;
}

/**
 * Build a sentence to inject into the Claude discovery prompt that hints at
 * upcoming events. Discovery already considers timeliness; this gives it
 * structured calendar awareness.
 */
export function buildHolidayPromptInjection(now: Date = new Date()): string {
  const upcoming = getUpcomingEvents(now, 3);
  if (upcoming.length === 0) return '';

  const lines: string[] = [
    'UPCOMING SEASONAL OPPORTUNITIES (consider for any niche that could lean into these):',
  ];
  for (const u of upcoming) {
    if (u.inWindow) {
      lines.push(
        `- ${u.event.label} is ${u.daysUntil} days away (PREP WINDOW — high priority). Buyers searching: ${u.event.keywords.slice(0, 5).join(', ')}.`,
      );
    } else {
      lines.push(
        `- ${u.event.label} is ${u.daysUntil} days away (still outside prep window of ${u.event.windowDays} days).`,
      );
    }
  }
  lines.push('');
  lines.push(
    'If a niche can be naturally tied to one of these events, prefer it AND mention the angle in gapAngle.',
  );
  return lines.join('\n');
}
