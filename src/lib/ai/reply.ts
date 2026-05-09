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

export interface ReplyContext {
  sender_name: string;
  message_text: string;
  platform: string;
}

function platformLabel(platform: string): string {
  if (platform.startsWith('fb_')) return 'Facebook';
  if (platform.startsWith('ig_')) return 'Instagram';
  if (platform.startsWith('wa_')) return 'WhatsApp';
  return platform;
}

function isDM(platform: string): boolean {
  return platform.endsWith('_dm') || platform === 'wa_message';
}

function systemPrompt(brandKit: BrandKit, platform: string): string {
  const isDirect = isDM(platform);
  return [
    'Du beantwortest Kundennachrichten für Fly & Froth, ein Grafik- und',
    'Webdesignstudio in Karben (Frankfurt-Region). Inhaber: Mehmet Genco.',
    '',
    `Kanal: ${platformLabel(platform)} ${isDirect ? '(Direktnachricht)' : '(öffentlicher Kommentar)'}.`,
    '',
    'Stil:',
    '- Sprache: Deutsch',
    '- Ton: kompetent, freundlich, präzise',
    '- Maximal 2 kurze Sätze',
    '- Maximal 1 Emoji (optional)',
    '- Spreche den Kunden mit Vornamen an, falls bekannt',
    '- Keine Hashtags',
    '',
    'Inhaltliche Regeln:',
    '- Bei Preisfragen: höfliche Antwort + Verweis auf fly-froth.com/kontakt',
    '- Bei Service-Anfragen: kurzes Angebot + CTA "Schreib mir gerne eine DM"',
    '- Bei Komplimenten/Danksagungen: warm und kurz danken',
    '- Bei unklaren oder beleidigenden Nachrichten: höflich um Klärung bitten',
    '- Niemals konkrete Preise ohne vorherige Absprache nennen',
    `- Niemals verwenden: ${brandKit.negative_words.join(', ')}`,
    '',
    'Output: NUR der Antworttext. Kein JSON, keine Anführungszeichen,',
    'keine Erklärung.',
  ].join('\n');
}

function userPrompt(
  message: ReplyContext,
  parentPostText?: string,
): string {
  const parts: string[] = [];
  if (parentPostText) {
    parts.push(`Ursprünglicher Beitrag (Kontext):\n"""${parentPostText}"""\n`);
  }
  parts.push(`Kunde (${message.sender_name}) schreibt:`);
  parts.push(`"""${message.message_text}"""`);
  parts.push('');
  parts.push('Schreibe jetzt die Antwort.');
  return parts.join('\n');
}

export async function generateReply(
  message: ReplyContext,
  brandKit: BrandKit,
  parentPostText?: string,
): Promise<string> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      {
        type: 'text',
        text: systemPrompt(brandKit, message.platform),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt(message, parentPostText) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Claude reply response');
  }
  // Strip leading/trailing quotes the model sometimes adds anyway.
  return block.text.trim().replace(/^["„»«]+|["„»«]+$/g, '').trim();
}
