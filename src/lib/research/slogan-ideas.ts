/**
 * slogan-ideas.ts — Sprint K Faz 5
 *
 * OpenAI gpt-4o ile trend keyword'lerden t-shirt slogan ideas üretir.
 *
 * Input: niche + Google Trends rising queries + Pinterest trending keywords
 * Output: 20 slogan candidate + theme + style öneri + tahmini Etsy demand
 *
 * Mehmet seçimi (Faz 5 onboarding): gpt-4o (premium, daha yaratıcı slogan).
 * Maliyet tahmini: ~$0.02 per research run (her niche için 1 LLM call).
 */

import OpenAI from 'openai';

export interface SloganCandidate {
  slogan: string;
  /** Tematik motif önerisi (Banana 2 illustration prompt'una geçer). */
  theme: string;
  /** Önerilen Banana stil seçimi. */
  style: 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic';
  /** LLM'in subjektif Etsy demand tahmini: high / medium / low */
  demandHint: 'high' | 'medium' | 'low';
  /** Hangi trend keyword'ünden ilham aldı (referans). */
  inspiredBy?: string;
}

export interface SloganIdeasResult {
  niche: string;
  model: string;
  generatedAt: string;
  count: number;
  ideas: SloganCandidate[];
  promptTokens?: number;
  completionTokens?: number;
  costUsdEstimate: number;
}

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY env yok — slogan üretimi için zorunlu');
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

export interface GenerateSloganOpts {
  niche: string;
  /** Google Trends rising/top queries (raw strings) */
  googleTrends?: string[];
  /** Pinterest trending keywords (raw strings) */
  pinterestTrends?: string[];
  /** Kaç slogan istiyoruz? Default 20. Max 30. */
  count?: number;
}

const SYSTEM_PROMPT = `You are a senior Etsy print-on-demand merchandiser specializing in apparel (t-shirts, hoodies, totes). Your job: convert trend keywords into HIGH-CONVERTING slogan candidates that work on apparel.

RULES — non-negotiable:
1. Slogan length: 2-7 words, max 50 characters. Short = best.
2. NO copyrighted phrases (no song lyrics, no movie quotes, no brand names).
3. NO offensive content, no profanity, no political statements.
4. NO em-dashes, no smart quotes — only ASCII apostrophe (') if needed.
5. Each slogan should feel either: clever wordplay / relatable mood / aspirational vibe / community-identifier.
6. Avoid generic clichés ("Live laugh love"). Aim for fresh + specific.

OUTPUT FORMAT — strict JSON, no preamble:
{
  "ideas": [
    {
      "slogan": "Just here for the plot twists",
      "theme": "open book with stars and twists, vintage library",
      "style": "vintage-stamp",
      "demandHint": "high",
      "inspiredBy": "booktok plot twist"
    },
    ...
  ]
}

style enum: vintage-stamp | line-art | retro-poster | botanical | minimal-graphic
demandHint enum: high | medium | low (your judgment based on trend match + Etsy seasonality)`;

export async function generateSloganIdeas(opts: GenerateSloganOpts): Promise<SloganIdeasResult> {
  const niche = opts.niche.trim();
  if (!niche) throw new Error('generateSloganIdeas: niche boş olamaz');

  const count = Math.min(opts.count ?? 20, 30);

  const userPrompt = [
    `Niche: "${niche}"`,
    '',
    `Google Trends rising/top queries (relevance ordered):`,
    (opts.googleTrends ?? []).slice(0, 15).map((q, i) => `  ${i + 1}. ${q}`).join('\n') || '  (none provided)',
    '',
    `Pinterest trending keywords:`,
    (opts.pinterestTrends ?? []).slice(0, 15).map((q, i) => `  ${i + 1}. ${q}`).join('\n') || '  (none provided)',
    '',
    `Generate exactly ${count} slogan candidates. Return strict JSON per the format in the system prompt.`,
  ].join('\n');

  const client = getClient();
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.85,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  let parsed: { ideas?: SloganCandidate[] };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Slogan LLM JSON parse fail: ${err instanceof Error ? err.message : String(err)} — raw: ${raw.slice(0, 200)}`);
  }

  const ideas = (parsed.ideas ?? []).filter(
    (i) => i && typeof i.slogan === 'string' && i.slogan.trim().length > 0,
  );

  // Maliyet tahmini: gpt-4o $2.50/1M in + $10/1M out
  const promptTokens = completion.usage?.prompt_tokens ?? 0;
  const completionTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10;

  return {
    niche,
    model: 'gpt-4o',
    generatedAt: new Date().toISOString(),
    count: ideas.length,
    ideas,
    promptTokens,
    completionTokens,
    costUsdEstimate: Math.round(costUsd * 10000) / 10000,
  };
}
