import type { KleinanzeigenAnalysis } from '@/types';

export function analysisSystemPrompt(profile: string): string {
  return [
    'You are an assistant analyzing Kleinanzeigen buyer messages for Fly & Froth',
    '(Graphic & Web Design, Karben/DE).',
    '',
    'TASK: Read the buyer message, analyze it, and return a JSON summary.',
    '',
    'BUSINESS PROFILE (German, authoritative):',
    '---',
    profile,
    '---',
    '',
    'OUTPUT format (JSON only, no explanation):',
    '{',
    '  "subject": "short topic label, max 6 words, relevant to the message",',
    '  "lang": "de|en|tr|other",',
    '  "tone_detected": "du|Sie|unknown",',
    '  "knowledge_gaps": ["slug-1", "slug-2"]',
    '}',
    '',
    'knowledge_gaps: list service/topic slugs (lowercase, hyphenated)',
    'that the buyer explicitly asks for but are NOT defined in the profile.',
    'Return empty array if all mentioned services are in the profile.',
    'Do not guess; only list clear, explicit gaps.',
  ].join('\n');
}

export function analysisUserPrompt(buyerMessage: string): string {
  return ['BUYER MESSAGE:', '"""', buyerMessage, '"""', '', 'JSON output:'].join('\n');
}

export function replySystemPrompt(profile: string): string {
  return [
    'You are writing replies to Kleinanzeigen buyers on behalf of Fly & Froth (Mehmet Genco).',
    '',
    'RULES:',
    '- Reply in the buyer\'s language (usually German).',
    '- If tone_detected is "du", use du; if "Sie", use Sie. If "unknown", default to du.',
    '- Tone: casual, friendly, not corporate. Match Kleinanzeigen style.',
    '- Keep it short: 2–5 sentences. No hashtags.',
    '- Use exact prices/timelines from the profile if available; never make up details.',
    '- If the buyer asks for a service not in the profile, politely ask for more info',
    '  or redirect. Avoid promising what is not documented.',
    '- Use the signature from context if provided; otherwise sign "Liebe Grüße, Mehmet".',
    '- Output ONLY the reply text. No explanation, no JSON, no metadata.',
    '',
    'BUSINESS PROFILE:',
    '---',
    profile,
    '---',
  ].join('\n');
}

export interface ReplyContext {
  buyerName: string | null;
  listingTitle: string | null;
  buyerMessage: string;
  analysis: KleinanzeigenAnalysis;
}

export function replyUserPrompt(ctx: ReplyContext): string {
  return [
    `BUYER: ${ctx.buyerName ?? '(unknown)'}`,
    `LISTING: ${ctx.listingTitle ?? '(unknown)'}`,
    '',
    'PRE-ANALYSIS:',
    JSON.stringify(ctx.analysis, null, 2),
    '',
    'BUYER MESSAGE:',
    '"""',
    ctx.buyerMessage,
    '"""',
    '',
    'Write your reply:',
  ].join('\n');
}

export function alternativesUserPrompt(ctx: ReplyContext): string {
  return [
    replyUserPrompt(ctx),
    '',
    'This time, generate 3 DIFFERENT variations. Output as JSON array:',
    '[',
    '  {"label": "Short & casual", "text": "..."},',
    '  {"label": "Detailed + price", "text": "..."},',
    '  {"label": "Ask clarifying questions", "text": "..."}',
    ']',
    '',
    'Output ONLY the JSON array, nothing else.',
  ].join('\n');
}

export function refinementUserPrompt(args: {
  ctx: ReplyContext;
  previousReply: string;
  feedback: string;
}): string {
  return [
    replyUserPrompt(args.ctx),
    '',
    'PREVIOUS DRAFT REPLY:',
    '"""',
    args.previousReply,
    '"""',
    '',
    'USER FEEDBACK:',
    args.feedback,
    '',
    'Revise the reply based on this feedback:',
  ].join('\n');
}
