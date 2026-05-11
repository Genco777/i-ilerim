import Anthropic from '@anthropic-ai/sdk';
import type { KleinanzeigenAnalysis } from '@/types';
import { analysisSystemPrompt, analysisUserPrompt } from './prompts';
import { loadMergedProfile } from './profile';

const MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

function stripCodeFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function parseAnalysisResponse(raw: string): KleinanzeigenAnalysis {
  const fallback: KleinanzeigenAnalysis = {
    subject: 'Kleinanzeigen Nachricht',
    lang: 'de',
    tone_detected: 'unknown',
    knowledge_gaps: [],
  };
  try {
    const stripped = stripCodeFences(raw);
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    const tone = obj.tone_detected;
    const toneNorm: 'du' | 'Sie' | 'unknown' = tone === 'du' || tone === 'Sie' ? tone : 'unknown';
    return {
      subject:
        typeof obj.subject === 'string' && obj.subject.trim().length > 0
          ? obj.subject.trim().slice(0, 80)
          : fallback.subject,
      lang:
        typeof obj.lang === 'string' && obj.lang.trim().length > 0
          ? obj.lang.trim().slice(0, 10)
          : fallback.lang,
      tone_detected: toneNorm,
      knowledge_gaps: toStringArray(obj.knowledge_gaps),
    };
  } catch {
    return fallback;
  }
}

export async function analyzeKleinanzeigenMessage(
  buyerMessage: string,
): Promise<KleinanzeigenAnalysis> {
  const profile = await loadMergedProfile();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      { type: 'text', text: analysisSystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: analysisUserPrompt(buyerMessage) }],
  });
  const block = response.content[0];
  if (!block || block.type !== 'text') return parseAnalysisResponse('');
  return parseAnalysisResponse(block.text);
}
