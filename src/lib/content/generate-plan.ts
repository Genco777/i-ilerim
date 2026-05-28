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

  const slots = await createSlots(buildSlotData(plan.id, topics));

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

  const slots = await createSlots(buildSlotData(plan.id, topics));

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
