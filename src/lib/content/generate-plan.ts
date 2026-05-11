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

const WEEKLY_CALENDAR: {
  day: number; // 0=Mon..6=Sun
  pillar: ContentPillar;
  time: string;
  channel: 'feed' | 'reel';
}[] = [
  { day: 0, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 1, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 1, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 2, pillar: 'lokal', time: '18:30', channel: 'feed' },
  { day: 3, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 3, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 4, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 5, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 5, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 6, pillar: 'vitrine', time: '18:30', channel: 'feed' },
];

const GERMAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

interface PlanSlot {
  dayLabel: string;
  time: string;
  pillar: ContentPillar;
  channel: 'feed' | 'reel';
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
    'ABWECHSLUNG (KRITISCH):',
    '- JEDES Thema muss sich von den anderen 9 Slots UNTERSCHEIDEN — keine Wiederholungen',
    '- Verschiedene Dienstleistungen rotieren: nicht zweimal Webdesign in einer Woche',
    '- Für insight: verschiedene Designthemen (Typografie, Farbe, UX, Layout, Branding, Trends)',
    '- Für lokal: JEDE Woche eine ANDERE Stadt aus dem Rhein-Main-Gebiet',
    '- Für vitrine: verschiedene Projekte/Formate (Website, Logo, Flyer, Visitenkarte, Corporate Design)',
    '- Für reel: verschiedene Video-Konzepte (Timelapse, Before/After, Tutorial, Trend, Motion)',
    '',
    'Themen müssen konkret und realistisch sein. Keine Fantasie-Projekte oder erfundene Kundennamen.',
    'Jedes Thema auf Deutsch, maximal 80 Zeichen.',
    'Für reel-Slots: Themen wählen die Bewegung/Dynamik suggerieren (Timelapse, Vorher-Nachher, Animation).',
    '',
    'Antworte NUR mit JSON:',
    '{ "slots": [{ "dayLabel": "Montag", "time": "18:30", "pillar": "insight", "channel": "feed", "topic": "..." }, ...] }',
  ].join('\n');
}

function userPrompt(week: number, year: number): string {
  return `Erstelle Social-Media-Themen für Kalenderwoche ${week}, ${year}. Genau 10 Slots.`;
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

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(week, year) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') throw new Error('No text block in Claude response');

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const generated = JSON.parse(jsonMatch[0]) as GeneratedPlan;
  if (!generated.slots?.length) throw new Error('Empty slots array');

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const slotData = generated.slots.slice(0, 10).map((s, i) => {
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
  for (const s of slots) {
    pillarCounts[s.pillar] = (pillarCounts[s.pillar] ?? 0) + 1;
  }
  const summary = Object.entries(pillarCounts)
    .map(([k, v]) => `${v}× ${pillarEmoji[k] ?? ''} ${k}`)
    .join(' | ');
  lines.push(summary);
  lines.push('');

  for (let d = 0; d < 7; d++) {
    const daySlots = grouped[`${d}`] ?? [];
    for (const slot of daySlots) {
      const dayShort = GERMAN_DAYS[d]?.slice(0, 2) ?? '??';
      const emoji = pillarEmoji[slot.pillar] ?? '📌';
      const isReel = slot.channel === 'reel';
      const prefix = isReel ? '  🎬' : '';
      lines.push(`${dayShort} ${slot.time_slot} — ${emoji}${prefix} ${slot.topic ?? '(kein Thema)'}`);
    }
  }

  return lines.join('\n');
}
