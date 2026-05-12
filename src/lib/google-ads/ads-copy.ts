import Anthropic from '@anthropic-ai/sdk';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import type { AdsCampaignType } from './types';

const MODEL = 'claude-sonnet-4-6';

export interface AdCopyInput {
  campaignType: AdsCampaignType;
  targetUrl: string;
  conversionGoal: string | null;
}

export interface AdCopyOutput {
  headlines: string[];
  descriptions: string[];
}

const TYPE_HINT: Record<AdsCampaignType, string> = {
  search: 'Search ads — Suchanfragen mit klarer Kaufabsicht.',
  pmax: 'Performance Max — kanalübergreifend, breite Botschaften.',
  display: 'Display ads — visuell, markenstärkend, weniger Konversionsfokus.',
  retargeting: 'Retargeting — Nutzer, die die Seite kennen, zur Konversion bringen.',
  local: 'Local ads — lokale Sichtbarkeit, Wegbeschreibung & Anruf-Fokus.',
};

export async function generateAdCopy(input: AdCopyInput): Promise<AdCopyOutput> {
  const brandKit = await getBrandKit();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const negativeWords = brandKit.negative_words.length
    ? `Vermeide diese Wörter: ${brandKit.negative_words.join(', ')}.`
    : '';

  const prompt = `
Du bist Werbetexter für Fly & Froth, ein Design-Studio im Rhein-Main-Gebiet.

Schreibe Google Ads ${input.campaignType}-Anzeigen für: ${input.targetUrl}
Kampagnen-Kontext: ${TYPE_HINT[input.campaignType]}
Konversionsziel: ${input.conversionGoal ?? 'allgemeine Anfrage'}

Markenton: ${brandKit.text_tone_guide}
${negativeWords}

WICHTIG:
- Sprache: Deutsch
- 5 Headlines, jede MAX 30 Zeichen
- 3 Descriptions, jede MAX 90 Zeichen
- Kein Clickbait, keine Großbuchstaben-Schreierei
- Antworte nur mit JSON, kein Markdown

Schema:
{"headlines": ["...", "...", "...", "...", "..."], "descriptions": ["...", "...", "..."]}
`.trim();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text block for ad copy');
  }

  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract JSON from ad copy response');
  const parsed = JSON.parse(jsonMatch[0]) as AdCopyOutput;

  // Defensive: enforce length limits even if Claude overshot
  parsed.headlines = parsed.headlines.map((h) => h.slice(0, 30)).slice(0, 5);
  parsed.descriptions = parsed.descriptions.map((d) => d.slice(0, 90)).slice(0, 3);

  if (parsed.headlines.length < 3 || parsed.descriptions.length < 2) {
    throw new Error('Ad copy generation returned too few headlines/descriptions');
  }
  return parsed;
}
