import Anthropic from '@anthropic-ai/sdk';
import type { BrandKit } from '@/types';

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

function systemPrompt(brandKit: BrandKit): string {
  return [
    brandKit.text_tone_guide,
    '',
    `Niemals verwenden: ${brandKit.negative_words.join(', ')}`,
    '',
    'Output-Format (strikt):',
    '{',
    '  "text": "Hauptbeitrag, max 280 Zeichen für IG, mit Call-to-Action",',
    '  "hashtags": ["tag1", "tag2", ..., "tag8"]',
    '}',
    '',
    'Hashtag-Regeln:',
    '- 5-8 Stück',
    '- Brand-Hashtag IMMER: #flyfroth (niemals #flyandfroth oder #flyundfroth)',
    '- Mindestens 2 lokal: Karben, Frankfurt, Bad Vilbel, oder Frankfurt-Region',
    '- Mindestens 2 Service-bezogen',
    '- 1-2 generelle Trend-Tags (z.B. #DesignAgentur)',
  ].join('\n');
}

function userPrompt(topic: string, scheduleHint?: string): string {
  return [
    `Erstelle einen Instagram + Facebook Post zum Thema: "${topic}".`,
    scheduleHint ? `Geplant für: ${scheduleHint}` : '',
    '',
    'Antworte AUSSCHLIESSLICH mit dem JSON-Objekt, ohne Vor- oder Nachtext.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface GeneratedText {
  text: string;
  hashtags: string[];
}

export async function generateText(
  topic: string,
  brandKit: BrandKit,
  opts?: { scheduleHint?: string; previousAttempt?: string },
): Promise<GeneratedText> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt(topic, opts?.scheduleHint) },
  ];
  if (opts?.previousAttempt) {
    messages.push({ role: 'assistant', content: opts.previousAttempt });
    messages.push({
      role: 'user',
      content:
        'Dieser Versuch war nicht ideal. Generiere etwas Neues mit anderem Ton/Wortwahl.',
    });
  }

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: systemPrompt(brandKit),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Claude response');
  }
  const raw = block.text.trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON in Claude response: ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonMatch[0]) as {
    text?: unknown;
    hashtags?: unknown;
  };

  if (typeof parsed.text !== 'string' || !Array.isArray(parsed.hashtags)) {
    throw new Error(`Invalid Claude output shape: ${raw.slice(0, 200)}`);
  }
  return {
    text: parsed.text,
    hashtags: [...new Set(
      parsed.hashtags
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.replace(/^#/, '').trim().toLowerCase())
        .filter((h) => h.length > 1),
    )],
  };
}
