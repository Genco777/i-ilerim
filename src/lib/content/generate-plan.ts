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
  // 7 days from now
  const next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const start = new Date(next.getFullYear(), 0, 1);
  const days = Math.floor((next.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return { week: Math.ceil((days + start.getDay() + 1) / 7), year: next.getFullYear() };
}

// 9 feed posts + 3 reels + 6 stories = 18 slots per week
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

interface PlanSlot {
  dayLabel: string;
  time: string;
  pillar: ContentPillar;
  channel: 'feed' | 'reel' | 'story';
  topic: string;
}

interface GeneratedPlan {
  slots: PlanSlot[];
}

function systemPrompt(): string {
  return [
    'Du bist der Content-Planer für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Deutschland).',
    'Deine Aufgabe: Erstelle für jede Kalenderwoche relevante, ansprechende Social-Media-Themen.',
    '',
    'Inhaltliche Säulen:',
    '- vitrine: Portfolio-Arbeiten zeigen (Webdesign, Logodesign, Flyer, Visitenkarten, Branding)',
    '- prozess: Designprozess, Behind-the-Scenes, Workflow',
    '- insight: Design-Tipps, Typografie, Farbtheorie, Trends (Carousel-Posts)',
    '- lokal: Standort-bezogene Posts (19 Städte im Rhein-Main-Gebiet im Rotationsprinzip)',
    '- reel: Kurze Video-Themen (Design-Timelapse, Before/After, Trends, Motion)',
    '',
    'STORY-THEMEN (extra wichtig für Engagement):',
    '- Kurze, visuell starke Momentaufnahmen aus dem Design-Alltag',
    '- Behind-the-Scenes: Arbeitsplatz, Tools, Skizzen, Farbpaletten',
    '- Quick-Tipps: "3 Schriftarten, die immer funktionieren"',
    '- Kunden-Feedback: Google-Bewertungen als Zitat-Story',
    '- Lokale Impressionen: Karben, Frankfurt Skyline, Rhein-Main Region',
    '- Vorher/Nachher in 2-3 Frames',
    '',
    'ABWECHSLUNG (KRITISCH):',
    '- JEDES Thema muss sich von den anderen Slots UNTERSCHEIDEN — keine Wiederholungen',
    '- Verschiedene Dienstleistungen rotieren: nicht zweimal dasselbe in einer Woche',
    '- Für insight: verschiedene Designthemen (Typografie, Farbe, UX, Layout, Branding, Trends)',
    '- Für lokal: JEDE Woche eine ANDERE Stadt aus dem Rhein-Main-Gebiet (Karben, Frankfurt, Bad Vilbel, Friedberg, Hanau, Bad Homburg, Oberursel, Kronberg, Königstein, Bad Soden, Eschborn, Hofheim, Bad Nauheim, Butzbach, Niddatal, Rosbach, Wöllstadt, Nidderau, Bruchköbel)',
    '- Für vitrine: verschiedene Projekte/Formate (Website, Logo, Flyer, Visitenkarte, Corporate Design)',
    '- Für reel: verschiedene Video-Konzepte (Timelapse, Before/After, Tutorial, Trend, Motion)',
    '- Für story: authentische Einblicke — keine Werbesprache, natürlich und spontan',
    '',
    'Themen müssen konkret und realistisch sein. Keine Fantasie-Projekte oder erfundene Kundennamen.',
    'Jedes Thema auf Deutsch, maximal 80 Zeichen.',
    'Für reel-Slots: Themen wählen die Bewegung/Dynamik suggerieren.',
    'Für story-Slots: kurz und knackig, max 50 Zeichen.',
    '',
    'Antworte NUR mit JSON:',
    '{ "slots": [{ "dayLabel": "Montag", "time": "18:30", "pillar": "insight", "channel": "feed", "topic": "..." }, ...] }',
  ].join('\n');
}

function userPrompt(week: number, year: number, slotCount: number): string {
  return `Erstelle Social-Media-Themen für Kalenderwoche ${week}, ${year}. Genau ${slotCount} Slots.`;
}

export async function generateWeeklyPlan(chatId: number): Promise<{ plan: ContentPlan; slots: ContentSlot[] }> {
  const { week, year } = getCurrentWeek();

  const existing = await getPlanByWeek(week, year);
  if (existing && existing.status === 'approved') {
    throw new Error(`KW${week}/${year} onaylı plan mevcut. İptal için /plan-durum yaz.`);
  }

  // Clean up old draft plan if exists
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

  const slotCount = WEEKLY_CALENDAR.length;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(week, year, slotCount) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') throw new Error('No text block in Claude response');

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const generated = safeParsePlanJson(jsonMatch[0]);
  if (!generated.slots?.length) throw new Error('Empty slots array');

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const slotData = generated.slots.slice(0, slotCount).map((s, i) => {
    const template = WEEKLY_CALENDAR[i % WEEKLY_CALENDAR.length]!;
    return {
      plan_id: plan.id,
      day_of_week: template.day,
      time_slot: template.time,
      pillar: template.pillar,
      channel: template.channel,
      topic: s.topic,
      status: 'pending' as const,
    };
  });

  const slots = await createSlots(slotData);

  return { plan, slots };
}

function safeParsePlanJson(raw: string): GeneratedPlan {
  try {
    return JSON.parse(raw) as GeneratedPlan;
  } catch {
    // Repair: extract each slot topic individually via regex
    const slotMatches = raw.match(/\{[^}]+\}/g);
    if (!slotMatches) throw new Error(`Unparseable plan JSON: ${raw.slice(0, 300)}`);
    const slots: PlanSlot[] = [];
    for (const m of slotMatches) {
      const day = m.match(/"dayLabel"\s*:\s*"([^"]*)"/)?.[1];
      const time = m.match(/"time"\s*:\s*"([^"]*)"/)?.[1];
      const pillar = m.match(/"pillar"\s*:\s*"([^"]*)"/)?.[1];
      const channel = m.match(/"channel"\s*:\s*"([^"]*)"/)?.[1];
      const topic = m.match(/"topic"\s*:\s*"([^"]*)"/)?.[1];
      if (day && time && pillar && channel && topic) {
        slots.push({
          dayLabel: day,
          time,
          pillar: pillar as ContentPillar,
          channel: channel as 'feed' | 'reel' | 'story',
          topic,
        });
      }
    }
    if (slots.length === 0) throw new Error(`No repairable slots in plan JSON: ${raw.slice(0, 300)}`);
    return { slots };
  }
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

/**
 * Generate a plan for NEXT week (used by Sunday cron).
 * No cleanup of existing drafts — creates fresh.
 */
export async function generateNextWeekPlan(chatId: number): Promise<{ plan: ContentPlan; slots: ContentSlot[] }> {
  const { week, year } = getNextWeek();

  const existing = await getPlanByWeek(week, year);
  if (existing) {
    if (existing.status === 'approved') {
      throw new Error(`KW${week}/${year} zaten onaylı.`);
    }
    // Clean up old draft
    const { getSlotsByPlan, deleteSlot } = await import('@/lib/db/queries/plans');
    const oldSlots = await getSlotsByPlan(existing.id);
    for (const s of oldSlots) {
      if (s.post_id) {
        try { const { deletePost } = await import('@/lib/db/queries/posts'); await deletePost(s.post_id); } catch {}
      }
      await deleteSlot(s.id);
    }
  }

  const slotCount = WEEKLY_CALENDAR.length;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(week, year, slotCount) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') throw new Error('No text block in Claude response');

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const generated = safeParsePlanJson(jsonMatch[0]);
  if (!generated.slots?.length) throw new Error('Empty slots array');

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const slotData = generated.slots.slice(0, slotCount).map((s, i) => {
    const template = WEEKLY_CALENDAR[i % WEEKLY_CALENDAR.length]!;
    return {
      plan_id: plan.id,
      day_of_week: template.day,
      time_slot: template.time,
      pillar: template.pillar,
      channel: template.channel,
      topic: s.topic,
      status: 'pending' as const,
    };
  });

  const slots = await createSlots(slotData);

  return { plan, slots };
}
