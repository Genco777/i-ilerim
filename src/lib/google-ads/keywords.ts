import Anthropic from '@anthropic-ai/sdk';
import { getCustomer } from './client';
import type { KeywordSpec } from './types';

const MODEL = 'claude-sonnet-4-6';
const SEED_COUNT = 25;
const FINAL_COUNT = 15;

export interface KeywordInput {
  targetUrl: string;
  campaignContext: string;
  languageCode: string;
  locationId: number;
}

async function generateSeedKeywords(input: KeywordInput): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `
Generiere ${SEED_COUNT} deutsche Google-Ads-Keywords für eine Landing Page:
URL: ${input.targetUrl}
Kontext: ${input.campaignContext}

Mische:
- Kommerziell-intent ("buchen", "anfragen", "kaufen")
- Local-intent ("Frankfurt", "Rhein-Main", "in der Nähe")
- Informational, aber kaufnah

Antworte NUR mit JSON-Array, kein Markdown:
["keyword 1", "keyword 2", ...]
`.trim();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text block for keyword seeds');
  }
  const match = textBlock.text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not extract JSON array from keyword response');
  const parsed = JSON.parse(match[0]) as string[];
  return parsed.filter((k) => typeof k === 'string' && k.trim().length > 0);
}

interface KeywordIdea {
  text: string;
  avg_monthly_searches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

async function expandWithGoogle(
  seeds: string[],
  languageCode: string,
  locationId: number,
): Promise<KeywordIdea[]> {
  const customer = await getCustomer();

  // The SDK wraps the response in a GenerateKeywordIdeaResponse with a `.results` array.
  // `keyword_plan_network` accepts the keyof-string form of the enum ('GOOGLE_SEARCH').
  // Cast request to `any` because the community wrapper's TS type for
  // GenerateKeywordIdeasRequest is re-exported from google-ads-node protos and the
  // exact shape (optional vs required fields) isn't resolvable without the proto source
  // available at compile time in this project.
  const response = await customer.keywordPlanIdeas.generateKeywordIdeas({
    language: `languageConstants/${langCodeToId(languageCode)}`,
    geo_target_constants: [`geoTargetConstants/${locationId}`],
    keyword_plan_network: 'GOOGLE_SEARCH',
    keyword_seed: { keywords: seeds },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // The response object has a `.results` array of GenerateKeywordIdeaResult
  type RawResult = {
    text?: string | null;
    keyword_idea_metrics?: {
      avg_monthly_searches?: number | null;
      // competition is a KeywordPlanCompetitionLevel enum value (number) or its key string
      competition?: number | string | null;
    } | null;
  };

  const results: RawResult[] = (response as { results?: RawResult[] }).results ?? [];

  return results
    .map((idea) => {
      const competitionRaw = idea.keyword_idea_metrics?.competition;
      let competition: KeywordIdea['competition'] = 'UNKNOWN';
      if (typeof competitionRaw === 'string') {
        const upper = competitionRaw.toUpperCase();
        if (upper === 'LOW' || upper === 'MEDIUM' || upper === 'HIGH') {
          competition = upper as KeywordIdea['competition'];
        }
      } else if (typeof competitionRaw === 'number') {
        // enum: UNSPECIFIED=0, UNKNOWN=1, LOW=2, MEDIUM=3, HIGH=4
        const numMap: Record<number, KeywordIdea['competition']> = {
          2: 'LOW',
          3: 'MEDIUM',
          4: 'HIGH',
        };
        competition = numMap[competitionRaw] ?? 'UNKNOWN';
      }
      return {
        text: idea.text ?? '',
        avg_monthly_searches: idea.keyword_idea_metrics?.avg_monthly_searches ?? 0,
        competition,
      };
    })
    .filter((i) => i.text.length > 0);
}

// Minimal language-code → Google language-constant ID map (extend as needed)
function langCodeToId(code: string): number {
  const map: Record<string, number> = {
    de: 1001,
    en: 1000,
    tr: 1037,
  };
  const id = map[code];
  if (!id) throw new Error(`Unsupported language_code: ${code}`);
  return id;
}

export async function generateKeywords(input: KeywordInput): Promise<KeywordSpec[]> {
  const seeds = await generateSeedKeywords(input);

  let ideas: KeywordIdea[];
  try {
    ideas = await expandWithGoogle(seeds, input.languageCode, input.locationId);
  } catch (err) {
    // Fall back to raw seeds if Keyword Idea Service unavailable
    console.warn('[ads/keywords] Keyword Idea Service failed, using seeds only:', err);
    return seeds.slice(0, FINAL_COUNT).map((k) => ({ keyword: k, match_type: 'BROAD' }));
  }

  // Sort by avg_monthly_searches desc, dedupe by lowercased text
  const seen = new Set<string>();
  const sorted = ideas
    .filter((i) => {
      const key = i.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.avg_monthly_searches - a.avg_monthly_searches);

  return sorted.slice(0, FINAL_COUNT).map((i) => ({
    keyword: i.text,
    match_type: 'BROAD',
  }));
}
