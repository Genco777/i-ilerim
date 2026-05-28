import Anthropic from '@anthropic-ai/sdk';
import { createPlan, createSlots, getPlanByWeek } from '@/lib/db/queries/plans';
import type { ContentPillar, ContentPlan, ContentSlot } from '@/types';

const MODEL = 'claude-sonnet-4-6';

export function getCurrentWeek(): { week: number; year: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return { week: Math.ceil((days + start.getDay() + 1) / 7), year: now.getFullYear() };
}

export function getNextWeek(): { week: number; year: number } {
  const now = new Date();
  const next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const start = new Date(next.getFullYear(), 0, 1);
  const days = Math.floor((next.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return { week: Math.ceil((days + start.getDay() + 1) / 7), year: next.getFullYear() };
}

const WEEKLY_CALENDAR: {
  day: number;
  pillar: ContentPillar;
  time: string;
  channel: 'feed' | 'reel' | 'story';
}[] = [
  // Montag — Woche mit Wissen starten
  { day: 0, pillar: 'insight',  time: '18:30', channel: 'feed'  }, //  1 insight feed
  { day: 0, pillar: 'vitrine',  time: '08:30', channel: 'story' }, //  2 vitrine story
  { day: 0, pillar: 'prozess',  time: '20:30', channel: 'story' }, //  3 prozess story

  // Dienstag — Energie und Bewegung
  { day: 1, pillar: 'vitrine',  time: '18:30', channel: 'feed'  }, //  4 vitrine feed
  { day: 1, pillar: 'reel',     time: '12:00', channel: 'reel'  }, //  5 reel
  { day: 1, pillar: 'insight',  time: '09:00', channel: 'story' }, //  6 insight story

  // Mittwoch — Lokal und Prozess
  { day: 2, pillar: 'lokal',    time: '18:30', channel: 'feed'  }, //  7 lokal feed
  { day: 2, pillar: 'prozess',  time: '14:00', channel: 'story' }, //  8 prozess story
  { day: 2, pillar: 'lokal',    time: '09:00', channel: 'story' }, //  9 lokal story

  // Donnerstag — Prozess und Reel
  { day: 3, pillar: 'prozess',  time: '18:30', channel: 'feed'  }, // 10 prozess feed
  { day: 3, pillar: 'reel',     time: '12:00', channel: 'reel'  }, // 11 reel
  { day: 3, pillar: 'vitrine',  time: '20:00', channel: 'story' }, // 12 vitrine story

  // Freitag — Insight und Portfolio
  { day: 4, pillar: 'insight',  time: '18:30', channel: 'feed'  }, // 13 insight feed
  { day: 4, pillar: 'vitrine',  time: '09:00', channel: 'story' }, // 14 vitrine story
  { day: 4, pillar: 'prozess',  time: '12:00', channel: 'story' }, // 15 prozess story

  // Samstag — Lokal und Reel
  { day: 5, pillar: 'lokal',    time: '18:30', channel: 'feed'  }, // 16 lokal feed
  { day: 5, pillar: 'reel',     time: '12:00', channel: 'reel'  }, // 17 reel
  { day: 5, pillar: 'insight',  time: '19:00', channel: 'story' }, // 18 insight story

  // Sonntag — Wochenabschluss
  { day: 6, pillar: 'vitrine',  time: '18:30', channel: 'feed'  }, // 19 vitrine feed
  { day: 6, pillar: 'lokal',    time: '11:00', channel: 'story' }, // 20 lokal story
];
// Distribution: vitrine 5 (25%) | insight 5 (25%) | prozess 5 (25%) | lokal 4 (20%) | reel 3 (15%)

const GERMAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Rotating city list for lokal pillar — include specific business context
const LOKAL_CITIES = [
  'Karben', 'Frankfurt am Main', 'Bad Vilbel', 'Friedberg (Hessen)',
  'Hanau', 'Bad Homburg', 'Oberursel', 'Kronberg im Taunus',
  'Königstein im Taunus', 'Bad Soden am Taunus', 'Eschborn',
  'Hofheim am Taunus', 'Bad Nauheim', 'Butzbach', 'Niddatal',
  'Rosbach vor der Höhe', 'Wöllstadt', 'Nidderau', 'Bruchköbel',
];

function pickLokalCities(week: number, count: number): string[] {
  const offset = (week * 3) % LOKAL_CITIES.length;
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(LOKAL_CITIES[(offset + i) % LOKAL_CITIES.length]!);
  }
  return result;
}


// =============================================================================
// ALMANYA (HESSEN) RESMI TATIL GUNLERi
// Hesaplama: Easter + turevleri + sabit tarihler
// =============================================================================

function easterDate(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Returns a Map of ISO date string -> holiday name for Hessen (Germany).
 * Includes: national holidays + Hessen-specific (Fronleichnam)
 * + major commercial occasions (Valentinstag, Muttertag, Vatertag, Silvester).
 */
export function getHessenHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const easter = easterDate(year);

  // Fixed national holidays
  holidays.set(`${year}-01-01`, 'Neujahr');
  holidays.set(`${year}-05-01`, 'Tag der Arbeit');
  holidays.set(`${year}-10-03`, 'Tag der Deutschen Einheit');
  holidays.set(`${year}-12-25`, '1. Weihnachtstag');
  holidays.set(`${year}-12-26`, '2. Weihnachtstag');

  // Moveable national holidays
  holidays.set(isoDate(addDays(easter, -2)), 'Karfreitag');
  holidays.set(isoDate(addDays(easter, 1)),  'Ostermontag');
  holidays.set(isoDate(addDays(easter, 39)), 'Christi Himmelfahrt');
  holidays.set(isoDate(addDays(easter, 50)), 'Pfingstmontag');

  // Hessen-specific: Fronleichnam (60 days after Easter)
  holidays.set(isoDate(addDays(easter, 60)), 'Fronleichnam');

  // === Commercial occasions (not public holidays, but great for social media) ===
  // Valentinstag — Feb 14
  holidays.set(`${year}-02-14`, 'Valentinstag');

  // Muttertag — 2nd Sunday in May
  const may1 = new Date(year, 4, 1);
  const firstSundayInMay = (7 - may1.getDay()) % 7;
  const muttertag = new Date(year, 4, 1 + firstSundayInMay + 7);
  holidays.set(isoDate(muttertag), 'Muttertag');

  // Vatertag — same as Christi Himmelfahrt (always Thursday)
  // (already added above as Christi Himmelfahrt)
  // But let's rename it for social context
  const himmelfahrt = isoDate(addDays(easter, 39));
  holidays.set(himmelfahrt, 'Christi Himmelfahrt / Vatertag');

  // Nikolaus — Dec 6 (not holiday but big in Germany)
  holidays.set(`${year}-12-06`, 'Nikolaustag');

  // Silvester — Dec 31
  holidays.set(`${year}-12-31`, 'Silvester');

  // 1. Advent (4th Sunday before Christmas)
  const christmas = new Date(year, 11, 25);
  const dayOfWeek = christmas.getDay(); // 0=Sun
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const advent4 = new Date(year, 11, 25 - (dayOfWeek === 0 ? 7 : dayOfWeek));
  const advent1 = addDays(advent4, -21);
  holidays.set(isoDate(advent1), '1. Advent');

  // Halloween — Oct 31 (commercial, popular in Germany)
  holidays.set(`${year}-10-31`, 'Halloween');

  return holidays;
}

/**
 * Returns ISO date strings for all 7 days of a given calendar week (Mon-Sun, ISO week).
 */
export function getWeekDates(week: number, year: number): string[] {
  // Find Jan 4 (always in week 1 of ISO year)
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // 1=Mon, 7=Sun
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - (jan4Day - 1) + (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => isoDate(addDays(weekStart, i)));
}

/**
 * Given a week's dates, returns any Hessen holidays that fall in that week.
 * Returns array of { date, dayIndex (0=Mon), holidayName }
 */
export function getHolidaysInWeek(
  week: number,
  year: number,
): Array<{ date: string; dayIndex: number; name: string }> {
  const dates = getWeekDates(week, year);
  const holidays = getHessenHolidays(year);
  const result: Array<{ date: string; dayIndex: number; name: string }> = [];
  dates.forEach((date, i) => {
    const name = holidays.get(date);
    if (name) result.push({ date, dayIndex: i, name });
  });
  return result;
}

function systemPrompt(week: number, year: number): string {
  const slotCount = WEEKLY_CALENDAR.length;
  const slotPlan = WEEKLY_CALENDAR.map((s, i) => {
    const day = GERMAN_DAYS[s.day] ?? '??';
    const type = s.channel === 'story'
      ? 'STORY (max 60 Zeichen — schnell lesbar, ergänzt den Feed-Post des Tages)'
      : s.channel === 'reel'
        ? 'REEL (dynamisch, movement, vor/nachher, timelapse — kein statischer Inhalt)'
        : 'FEED (Hauptbeitrag, Substanz, Mehrwert)';
    return `${i + 1}. ${day} ${s.time} [${s.pillar.toUpperCase()}] ${type}`;
  }).join('\n');

  const lokalSlotCount = WEEKLY_CALENDAR.filter(s => s.pillar === 'lokal').length;
  const lokalCities = pickLokalCities(week, lokalSlotCount);

  return `Du bist der Content-Stratege für Fly & Froth — Grafik- & Webdesignstudio, Karben (Rhein-Main). Inhaber: Mehmet Genco.
Zielgruppe: Kleine Unternehmen, Selbstständige, Handwerker, Gastronomen, Dienstleister im Rhein-Main-Gebiet.

═══ INHALTLICHE SÄULEN & ERWARTETE QUALITÄT ═══

[VITRINE] — Portfolio zeigen, aber MIT Geschichte
❌ SCHLECHT: "Logo für einen Kunden fertiggestellt"
❌ SCHLECHT: "Neues Webdesign-Projekt"
✅ GUT: "Bäckerei Hoffmann wollte ein Logo, das nach Tradition aussieht — aber auch auf Instagram funktioniert. Hier ist, was wir entwickelt haben."
✅ GUT: "Visitenkarten für einen Elektriker aus Karben: Warum das Material genauso wichtig ist wie das Design."
✅ GUT: "Before/After: Wie eine neue Website einem Friseur in Bad Vilbel 40% mehr Buchungen brachte."
→ Dienstleistungen rotieren: Webdesign, Logodesign, Flyerdesign, Visitenkarten, Branding, CI-Paket, Drucksachen

[INSIGHT] — Expertenwissen, das echten Mehrwert bietet
❌ SCHLECHT: "Warum Design wichtig ist"
❌ SCHLECHT: "Tipps für gutes Logo"
✅ GUT: "Warum dein Logo in Schwarz-Weiß funktionieren MUSS — und wie du das in 2 Minuten testest."
✅ GUT: "Der Schriftart-Fehler, der deine Website unprofessionell wirken lässt (und wie du ihn sofort behebst)."
✅ GUT: "5 Zeichen, dass dein Logo ein Redesign braucht — #3 übersehen die meisten."
✅ GUT: "Warum PDF-Dateien für dein Logo nicht ausreichen — was du stattdessen brauchst."
→ Themen: Typografie, Farblehre, Logodesign-Prinzipien, Print vs. Digital, Webdesign-Fehler, CI-Aufbau, Druckformate

[PROZESS] — Behind-the-Scenes, authentisch und persönlich
❌ SCHLECHT: "So arbeiten wir"
❌ SCHLECHT: "Design-Prozess bei Fly & Froth"
✅ GUT: "Die ersten 20 Minuten mit einem neuen Kunden: Was ich immer als erstes frage — und warum."
✅ GUT: "Ich mache immer 15 Skizzen, bevor ich den Computer anschalte. Hier sind die Rohversionen eines aktuellen Projekts."
✅ GUT: "Kundenfeedback um 23 Uhr: 'Das ist nicht das, was ich wollte.' — So gehe ich damit um."
✅ GUT: "Warum ich manchmal ein Projekt ablehne — und was das mit Qualität zu tun hat."
→ Themen: Skizzier-Prozess, Kundengespräche, Revisionen, Tools, Arbeitsalltag, Freelancer-Leben, Entscheidungen

[LOKAL] — Lokale Relevanz mit Geschäftsbezug (KEINE generischen Stadterwähnungen)
❌ SCHLECHT: "Webdesign in Frankfurt"
❌ SCHLECHT: "Logodesign für Unternehmen in Bad Vilbel"
✅ GUT: "Warum immer mehr Restaurants in Frankfurt ihre Speisekarte auch als Website brauchen — und was das kostet."
✅ GUT: "Handwerker in Bad Homburg: Wie ein professionelles Logo dazu beiträgt, mehr Aufträge zu bekommen."
✅ GUT: "Eschborn ist das Büroviertel Frankfurts — aber wie sehen die Visitenkarten dort aus? (Spoiler: Oft überraschend schlecht.)"
→ Diese Woche bitte folgende Städte verwenden (je nach Slot-Anzahl): ${lokalCities.join(', ')}
→ Verbinde die Stadt mit einem spezifischen Geschäftsproblem, das Design lösen kann

[REEL] — Dynamische Video-Inhalte (nicht statisch beschreibbar)
✅ GUT: "Logo von Skizze bis fertig — 30 Sekunden Timelapse"
✅ GUT: "Vorher/Nachher: Alte vs. neue Website in 15 Sekunden"
✅ GUT: "Wie ich in 60 Sekunden erkläre, was Corporate Identity bedeutet"
✅ GUT: "3 Schriftarten, die NIEMALS zusammenpassen — schneller Vergleich"

═══ STORY-REGELN ═══
- Story MUSS thematisch zum Feed-Post DES GLEICHEN TAGES passen
- Max 60 Zeichen — kurzer Impuls, nicht der ganze Post nochmal
- Beispiele: "Erste Skizzen gerade fertig 👀", "Kannst du den Unterschied sehen?", "Hinter den Kulissen heute"

═══ VERBOTENE FORMULIERUNGEN ═══
- Generische Sätze: "Wir helfen Unternehmen", "Professionelles Design für alle", "Kontaktiert uns"
- Leere Versprechen: "Das beste Logo der Stadt", "Günstig und schnell"
- Klischees: "Ihr Erfolg ist unser Auftrag", "Wir denken außerhalb der Box"

═══ FORMAT ═══
GENAU ${slotCount} TOPICS für die unten stehenden Slots. Jeder Topic ist eine konkrete, spezifische Idee — kein Schlagwort, sondern ein Winkel mit Geschichte oder Mehrwert.

SLOT-LISTE:
${slotPlan}

Antworte NUR mit JSON:
{ "topics": ["Topic 1", ..., "Topic ${slotCount}"] }
EXAKT ${slotCount} Einträge. Keinen auslassen.`;
}

function userPrompt(week: number, year: number): string {
  const now = new Date();
  const month = now.toLocaleString('de-DE', { month: 'long' });
  const season = now.getMonth() >= 2 && now.getMonth() <= 4 ? 'Frühling'
    : now.getMonth() >= 5 && now.getMonth() <= 7 ? 'Sommer'
      : now.getMonth() >= 8 && now.getMonth() <= 10 ? 'Herbst'
        : 'Winter';

  return `Erstelle ${WEEKLY_CALENDAR.length} Social-Media-Themen für Kalenderwoche ${week}, ${year}.
Aktueller Monat: ${month} (${season}) — nutze saisonale Anlässe wo sinnvoll (z.B. Sommerpause, Herbstmessen, Jahresendgeschäft).
Jedes Thema soll konkret, spezifisch und mit klarem Blickwinkel sein. Exakt ${WEEKLY_CALENDAR.length} Topics — keines auslassen.`;
}

function parseTopicsJson(raw: string): string[] {
  // Try direct parse first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.topics)) return parsed.topics;
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through to regex */ }

  // Regex fallback: extract quoted strings from JSON array
  const arrayMatch = raw.match(/"topics"\s*:\s*\[([\s\S]*?)\]/);
  const target = arrayMatch?.[1] ?? raw;
  const topics = target.match(/"([^"]*)"/g)?.map((t) => t.replace(/^"|"$/g, '')) ?? [];
  if (topics.length === 0) throw new Error(`No topics extractable: ${raw.slice(0, 300)}`);
  return topics;
}

function callClaude(system: string, user: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  }).then((response) => {
    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('No text block in Claude response');
    return block.text;
  });
}

async function generateTopics(week: number, year: number): Promise<string[]> {
  const sys = systemPrompt(week, year);
  const usr = userPrompt(week, year);
  const slotCount = WEEKLY_CALENDAR.length;

  const raw = await callClaude(sys, usr);
  const topics = parseTopicsJson(raw);

  if (topics.length < slotCount) {
    const missing = slotCount - topics.length;
    const retryUser = `${usr}\n\nFEHLER: Nur ${topics.length} Topics erhalten. Es fehlen ${missing}. Liefere EXAKT ${slotCount} Topics — alle konkret und spezifisch.`;
    const raw2 = await callClaude(sys, retryUser);
    const topics2 = parseTopicsJson(raw2);
    if (topics2.length < slotCount) {
      throw new Error(`Claude lieferte ${topics2.length}/${slotCount} topics trotz Wiederholung`);
    }
    return topics2.slice(0, slotCount);
  }

  return topics.slice(0, slotCount);
}

function buildSlotData(planId: string, topics: string[]) {
  return WEEKLY_CALENDAR.map((template, i) => ({
    plan_id: planId,
    day_of_week: template.day,
    time_slot: template.time,
    pillar: template.pillar,
    channel: template.channel,
    topic: topics[i] ?? 'Kein Thema',
    status: 'pending' as const,
  }));
}


// ── Holiday slot injection ────────────────────────────────────────────────────
async function addHolidaySlots(
  planId: string,
  week: number,
  year: number,
): Promise<ContentSlot[]> {
  const weekHolidays = getHolidaysInWeek(week, year);
  if (weekHolidays.length === 0) return [];

  const { createSlot } = await import('@/lib/db/queries/plans');
  const slots: ContentSlot[] = [];

  for (const { dayIndex, name } of weekHolidays) {
    // Generate a topical German holiday post
    const holidayTopics: Record<string, string> = {
      'Neujahr': 'Frohes Neues Jahr! Fly & Froth wuenscht euch einen guten Start ins neue Jahr -- und einen frischen Markenauftritt.',
      'Karfreitag': 'Stille schaffen: Auch im Design braucht man manchmal Pause -- Karfreitag, Zeit zum Durchatmen.',
      'Ostermontag': 'Frohe Ostern von Fly & Froth! Neue Saison, neue Projekte -- jetzt beraten lassen.',
      'Tag der Arbeit': 'Zum Tag der Arbeit: Handwerk, Design und Leidenschaft gehoeren zusammen. Danke an alle fleissigen Unternehmer im Rhein-Main-Gebiet.',
      'Christi Himmelfahrt / Vatertag': 'Vatertag im Rhein-Main: Gutes Design ist wie ein guter Vater -- zuverlaessig, klar und immer auf den Punkt.',
      'Christi Himmelfahrt': 'Feiertag, aber die Ideen arbeiten weiter. Was koennen wir fuer euer naechstes Projekt planen?',
      'Pfingstmontag': 'Pfingstmontag -- Zeit fuer neue Impulse! Wie frisch ist euer Markenauftritt noch?',
      'Fronleichnam': 'Feiertag in Hessen: Wir schaffen den Raum, damit eure Marke zum Strahlen kommt.',
      'Tag der Deutschen Einheit': 'Tag der Deutschen Einheit: Starke Marken verbinden -- so wie ein gutes Design Unternehmen mit ihren Kunden verbindet.',
      'Nikolaustag': 'Nikolaus ist da! Habt ihr schon an eure Weihnachtskampagne gedacht? Fly & Froth hilft.',
      '1. Weihnachtstag': 'Frohe Weihnachten von Fly & Froth! Wir danken allen Kunden fuer ein wunderbares Jahr.',
      '2. Weihnachtstag': 'Weihnachten: Zeit fuer Familie -- und fuer neue Design-Traeume fuer das naechste Jahr.',
      'Silvester': 'Silvester: Das alte Jahr hat gute Projekte gebracht. Was plant ihr fuer 2026? Fly & Froth ist dabei.',
      'Valentinstag': 'Valentinstag: Zeigt eurer Zielgruppe, dass ihr sie liebt -- mit einem Auftritt, der begeistert.',
      'Muttertag': 'Muttertag: Danke an alle Mamas -- auch die, die nebenbei ihr eigenes Business fuehren!',
      'Halloween': 'Halloween: Erschreckt eure Konkurrenz -- mit einem Markenauftritt, der wirklich aufhorchen laesst.',
      '1. Advent': '1. Advent: Die Weihnachtszeit beginnt. Ist euer Markenauftritt bereit fuer die wichtigste Saison des Jahres?',
    };

    const topic = holidayTopics[name] ?? `${name}: Fly & Froth wuenscht einen schoenen Feiertag im Rhein-Main-Gebiet.`;

    const slot = await createSlot({
      plan_id: planId,
      day_of_week: dayIndex,
      time_slot: '11:00',
      pillar: 'lokal' as ContentPillar,
      channel: 'feed',
      topic,
      status: 'pending',
    });
    slots.push(slot);
  }

  return slots;
}

export async function generateWeeklyPlan(chatId: number): Promise<{ plan: ContentPlan; slots: ContentSlot[] }> {
  const { week, year } = getCurrentWeek();

  const existing = await getPlanByWeek(week, year);
  if (existing && existing.status === 'approved') {
    throw new Error(`KW${week}/${year} onaylı plan mevcut. İptal için /plan-durum yaz.`);
  }

  if (existing) {
    const { getSlotsByPlan, deleteSlot } = await import('@/lib/db/queries/plans');
    const oldSlots = await getSlotsByPlan(existing.id);
    for (const s of oldSlots) {
      if (s.post_id) {
        try { const { deletePost } = await import('@/lib/db/queries/posts'); await deletePost(s.post_id); } catch {}
      }
      await deleteSlot(s.id);
    }
  }

  const topics = await generateTopics(week, year);

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const baseSlots = await createSlots(buildSlotData(plan.id, topics));
  const holidaySlots = await addHolidaySlots(plan.id, week, year);
  const slots = [...baseSlots, ...holidaySlots];

  return { plan, slots };
}

export async function generateNextWeekPlan(chatId: number): Promise<{ plan: ContentPlan; slots: ContentSlot[] }> {
  const { week, year } = getNextWeek();

  const existing = await getPlanByWeek(week, year);
  if (existing) {
    if (existing.status === 'approved') {
      throw new Error(`KW${week}/${year} zaten onaylı.`);
    }
    const { getSlotsByPlan, deleteSlot } = await import('@/lib/db/queries/plans');
    const oldSlots = await getSlotsByPlan(existing.id);
    for (const s of oldSlots) {
      if (s.post_id) {
        try { const { deletePost } = await import('@/lib/db/queries/posts'); await deletePost(s.post_id); } catch {}
      }
      await deleteSlot(s.id);
    }
  }

  const topics = await generateTopics(week, year);

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const baseSlots = await createSlots(buildSlotData(plan.id, topics));
  const holidaySlots = await addHolidaySlots(plan.id, week, year);
  const slots = [...baseSlots, ...holidaySlots];

  return { plan, slots };
}

export function formatPlanForTelegram(plan: ContentPlan, slots: ContentSlot[]): string {
  const pillarEmoji: Record<string, string> = {
    vitrine: '🖼',
    prozess: '🎬',
    insight: '📊',
    lokal: '📍',
    reel: '🎥',
  };

  const grouped: Record<string, ContentSlot[]> = {};
  for (const s of slots) {
    const key = `${s.day_of_week}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  const lines: string[] = [
    `📅 **Woche ${plan.calendar_week} — ${plan.year}**`,
    '',
  ];

  const pillarCounts: Record<string, number> = {};
  const channelCounts: Record<string, number> = {};
  for (const s of slots) {
    pillarCounts[s.pillar] = (pillarCounts[s.pillar] ?? 0) + 1;
    channelCounts[s.channel] = (channelCounts[s.channel] ?? 0) + 1;
  }
  const summary = Object.entries(pillarCounts)
    .map(([k, v]) => `${v}× ${pillarEmoji[k] ?? ''} ${k}`)
    .join(' | ');
  const chSummary = Object.entries(channelCounts)
    .map(([k, v]) => `${v}× ${k === 'feed' ? '📱' : k === 'reel' ? '🎥' : '📖'} ${k}`)
    .join(' | ');
  lines.push(summary);
  lines.push(chSummary);
  lines.push('');

  for (let d = 0; d < 7; d++) {
    const daySlots = grouped[`${d}`] ?? [];
    if (daySlots.length === 0) continue;
    const dayName = GERMAN_DAYS[d] ?? '??';
    lines.push(`*${dayName}*`);
    for (const slot of daySlots) {
      const emoji = pillarEmoji[slot.pillar] ?? '📌';
      const chIcon = slot.channel === 'reel' ? '🎬' : slot.channel === 'story' ? '📖' : '';
      const topic = slot.topic ?? '(kein Thema)';
      lines.push(`  ${slot.time_slot} ${chIcon} ${emoji} ${topic}`);
    }
  }

  return lines.join('\n');
}
