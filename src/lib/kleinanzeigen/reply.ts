import Anthropic from '@anthropic-ai/sdk';
import {
  replySystemPrompt,
  replyUserPrompt,
  alternativesUserPrompt,
  refinementUserPrompt,
  type ReplyContext,
} from './prompts';
import { loadMergedProfile } from './profile';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 600;
const ALT_MAX_TOKENS = 1200;

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

export function cleanReplyText(s: string): string {
  return s.trim().replace(/^["„»«]+|["„»«]+$/g, '').trim();
}

export async function generateSingleReply(ctx: ReplyContext): Promise<string> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: replyUserPrompt(ctx) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Kleinanzeigen reply response');
  }
  return cleanReplyText(block.text);
}

export async function refineReply(args: {
  ctx: ReplyContext;
  previousReply: string;
  feedback: string;
}): Promise<string> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: refinementUserPrompt(args) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in refinement response');
  }
  return cleanReplyText(block.text);
}

export interface ReplyAlternative {
  label: string;
  text: string;
}

export function parseAlternativesResponse(raw: string): ReplyAlternative[] {
  try {
    const stripped = stripCodeFences(raw);
    const arr = JSON.parse(stripped) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((entry): ReplyAlternative | null => {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const label = typeof e.label === 'string' ? e.label.trim() : '';
        const text = typeof e.text === 'string' ? e.text.trim() : '';
        if (!label || !text) return null;
        return { label, text: cleanReplyText(text) };
      })
      .filter((x): x is ReplyAlternative => x !== null);
  } catch {
    return [];
  }
}

export async function generateAlternatives(ctx: ReplyContext): Promise<ReplyAlternative[]> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: ALT_MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: alternativesUserPrompt(ctx) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') return [];
  return parseAlternativesResponse(block.text);
}

export type ReplyStyle = 'short' | 'detailed' | 'question';

const STYLE_HINTS: Record<ReplyStyle, string> = {
  short:
    'STİL: Çok kısa ve rahat tut, max 2-3 cümle. Resmi olma, samimi yaz.',
  detailed:
    'STİL: Daha detaylı yaz. Fiyat ve teslim süresini açıkça belirt. 4-5 cümle.',
  question:
    'STİL: Cevap vermek yerine ÖNCE alıcıya gerekli bilgileri sor (format, boyut, kullanım amacı, vb). Kısa, samimi soru-cevap.',
};

export async function generateStyledReply(
  ctx: ReplyContext,
  style: ReplyStyle,
): Promise<string> {
  const profile = await loadMergedProfile();
  const userPrompt = replyUserPrompt(ctx) + '\n\n' + STYLE_HINTS[style];
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in styled reply response');
  }
  return cleanReplyText(block.text);
}
