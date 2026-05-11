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
  // Monday
  { day: 0, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 0, pillar: 'vitrine', time: '08:30', channel: 'story' },
  // Tuesday
  { day: 1, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 1, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 1, pillar: 'prozess', time: '12:30', channel: 'story' },
  // Wednesday
  { day: 2, pillar: 'lokal', time: '18:30', channel: 'feed' },
  { day: 2, pillar: 'vitrine', time: '14:00', channel: 'story' },
  // Thursday
  { day: 3, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 3, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 3, pillar: 'prozess', time: '20:00', channel: 'story' },
  // Friday
  { day: 4, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 4, pillar: 'vitrine', time: '09:00', channel: 'story' },
  // Saturday
  { day: 5, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 5, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 5, pillar: 'vitrine', time: '19:00', channel: 'story' },
  // Sunday
  { day: 6, pillar: 'vitrine', time: '18:30', channel: 'feed' },
];

const GERMAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function systemPrompt(): string {
  const slotPlan = WEEKLY_CALENDAR.map((s, i) => {
    const day = GERMAN_DAYS[s.day] ?? '??';
    const type = s.channel === 'story' ? 'STORY (kurz, 50 Zeichen, zum Feed-Post passend)'
      : s.channel === 'reel' ? 'REEL (Bewegung/Dynamik)' : 'FEED (80 Zeichen)';
    return `${i + 1}. ${day} ${s.time} [${s.pillar}] ${type}`;
  }).join('\n');

  return [
    'Du bist der Content-Planer für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Deutschland).',
    '',
    'Inhaltliche Säulen:',
    '- vitrine: Portfolio-Arbeiten zeigen (Webdesign, Logodesign, Flyer, Visitenkarten, Branding)',
    '- prozess: Designprozess, Behind-the-Scenes, Workflow',
    '- insight: Design-Tipps, Typografie, Farbtheorie, Trends',
    '- lokal: Standort-bezogene Posts (19 Städte im Rhein-Main-Gebiet im Rotationsprinzip)',
    '- reel: Kurze Video-Themen (Design-Timelapse, Before/After, Trends, Motion)',
    '',
    'STORY-REGELN:',
    '- Story MUSS thematisch zum Feed-Post DES GLEICHEN TAGES passen',
    '- Authentisch, kein Werbesprech, max 50 Zeichen',
    '- Beispiele: Schreibtisch mit Skizzen, Screen-Ausschnitt, Skyline-Impression',
    '',
    'ABWECHSLUNG:',
    '- KEINE Wiederholungen zwischen den 16 Themen',
    '- Verschiedene Dienstleistungen und Designthemen rotieren',
    '- Jede Woche andere Stadt aus: Karben, Frankfurt, Bad Vilbel, Friedberg, Hanau, Bad Homburg, Oberursel, Kronberg, Königstein, Bad Soden, Eschborn, Hofheim, Bad Nauheim, Butzbach, Niddatal, Rosbach, Wöllstadt, Nidderau, Bruchköbel',
    '',
    'Themen konkret und realistisch. Keine Fantasie-Projekte.',
    '',
    'GENAU 16 TOPICS — jedes für den entsprechenden Slot in der Liste unten:',
    slotPlan,
    '',
    'Antworte NUR mit JSON:',
    '{ "topics": ["Topic 1", "Topic 2", ... "Topic 16"] }',
    'EXAKT 16 Einträge im Array. Keinen auslassen.',
  ].join('\n');
}

function userPrompt(week: number, year: number): string {
  return `Erstelle 16 Social-Media-Themen für Kalenderwoche ${week}, ${year}. Exakt 16 Topics, keines auslassen.`;
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
  const sys = systemPrompt();
  const usr = userPrompt(week, year);
  const slotCount = WEEKLY_CALENDAR.length;

  const raw = await callClaude(sys, usr);
  const topics = parseTopicsJson(raw);

  if (topics.length < slotCount) {
    // Retry once with explicit missing count
    const missing = slotCount - topics.length;
    const retryUser = `${usr}\n\nFEHLER: Nur ${topics.length} Topics. Es fehlen ${missing}. LIEFERE EXAKT ${slotCount} TOPICS.`;
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
