import Anthropic from '@anthropic-ai/sdk';
import type { ContentSlot, ContentPillar } from '@/types';
import type { PortfolioItem } from './templates';

const MODEL = 'claude-sonnet-4-6';

export interface EmailContent {
  digestIntro: string;
  portfolioIntro: string;
  portfolioItems: PortfolioItem[];
  closingText: string;
  subjectDigest: string;
  subjectPortfolio: string;
}

const GERMAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function systemPrompt(): string {
  return [
    'Du schreibst Email-Marketing-Texte für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Rhein-Main).',
    'Die Marke: über 850 Projekte, 5,0 Google-Bewertung, faire Preise, Express 24h möglich.',
    '',
    'TON: Professionell, selbstbewusst, nahbar. Kein Werbesprech. Keine Übertreibungen.',
    'JEDE Woche ANDERE Texte — keinerlei Wiederholungen zu früheren Aussendungen.',
    'Deutsch, Zielgruppe sind lokale Geschäftskunden und Selbstständige aus dem Rhein-Main-Gebiet.',
    '',
    'WICHTIG: Keine Anreden wie "Liebe Kunden" oder "Hallo zusammen" — direkt und modern.',
    '',
    'Antworte NUR mit JSON:',
    '{',
    '  "digestIntro": "2-3 Sätze — worum gehts diese Woche, was ist das Thema",',
    '  "portfolioIntro": "2 Sätze — Einleitung zu den neuen Portfolio-Arbeiten",',
    '  "closingText": "1 Satz — individueller Abschluss mit Bezug zur Woche",',
    '  "subjectDigest": "Betreffzeile ohne KW — zB. Design-Trends, lokale Projekte & frische Ideen",',
    '  "subjectPortfolio": "Betreffzeile ohne KW — zB. Neue Arbeiten aus dem Studio",',
    '  "portfolioItems": [',
    '    { "headline": "...", "description": "2 Sätze zum Projekt", "cta": "...", "serviceType": "..." }',
    '  ]',
    '}',
  ].join('\n');
}

function userPrompt(slots: ContentSlot[], week: number, year: number): string {
  const topics = slots.map((s) => {
    const day = GERMAN_DAYS[s.day_of_week] ?? '?';
    return `- ${day} [${s.pillar}] ${s.channel}: ${s.topic}`;
  }).join('\n');

  const portfolioSlots = slots.filter((s) => s.pillar === 'vitrine' || s.pillar === 'reel');

  return [
    `Kalenderwoche ${week}, ${year}.`,
    '',
    'Alle 16 geplanten Themen:',
    topics,
    '',
    `Portfolio-Projekte (${portfolioSlots.length} Stück) — für jedes einen eigenen portfolioItem-Eintrag:`,
    portfolioSlots.map((s) => `- ${s.topic}`).join('\n'),
    '',
    'Erstelle frische Email-Texte, die es so noch nie gab.',
  ].join('\n');
}

function parseContentJson(raw: string, fallbackCount: number): EmailContent {
  // Try direct parse
  try {
    const parsed = JSON.parse(raw);
    if (parsed.digestIntro && parsed.subjectDigest) return parsed;
  } catch { /* regex fallback */ }

  // Fallback: manually extract fields
  const extract = (field: string) => {
    const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
    return raw.match(re)?.[1]?.replace(/\\"/g, '"').replace(/\\n/g, '\n') ?? '';
  };

  return {
    digestIntro: extract('digestIntro') || `Neue Woche, neue Inspiration. Das sind unsere aktuellen Projekte und Themen aus KW${new Date().getFullYear()}.`,
    portfolioIntro: extract('portfolioIntro') || 'Hier ein Blick hinter die Kulissen unserer aktuellen Design-Arbeiten.',
    closingText: extract('closingText') || 'Alle Angebote mit Express 24h. Wir freuen uns auf dein Projekt.',
    subjectDigest: extract('subjectDigest') || 'Fly & Froth Weekly Digest',
    subjectPortfolio: extract('subjectPortfolio') || 'Neue Design-Projekte — Fly & Froth',
    portfolioItems: [], // Will be augmented by caller
  };
}

export async function generateEmailContent(
  slots: ContentSlot[],
  week: number,
  year: number,
): Promise<EmailContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(slots, week, year) }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const content = parseContentJson(raw, slots.length);

  // Build portfolio items from vitrine + reel slots, using AI text if available
  const portfolioSlots = slots.filter((s) => s.pillar === 'vitrine' || s.pillar === 'reel');
  const aiItems = content.portfolioItems ?? [];

  const serviceMap: Record<string, string> = {
    webdesign: 'Webdesign', website: 'Webdesign',
    logodesign: 'Logodesign', logo: 'Logodesign',
    flyerdesign: 'Flyerdesign', flyer: 'Flyerdesign',
    druckdesign: 'Druckdesign', branding: 'Branding',
  };

  const portfolioItems: PortfolioItem[] = portfolioSlots.slice(0, 6).map((s, i) => {
    const ai = aiItems[i];
    const topic = (s.topic ?? '').toLowerCase();
    let serviceType = 'Design Service';
    for (const [key, label] of Object.entries(serviceMap)) {
      if (topic.includes(key)) { serviceType = label; break; }
    }
    if (s.pillar === 'reel') serviceType = 'Video';

    return {
      headline: ai?.headline ?? s.topic ?? 'Neues Projekt',
      description: ai?.description ?? 'Ein Blick hinter die Kulissen unseres Design-Prozesses — direkt aus Karben, Rhein-Main.',
      cta: ai?.cta ?? (s.pillar === 'reel' ? 'Reel ansehen' : 'Projekt ansehen'),
      serviceType: ai?.serviceType ?? serviceType,
    };
  });

  return { ...content, portfolioItems };
}
