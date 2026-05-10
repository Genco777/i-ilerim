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

export interface GenerateMailDraftInput {
  recipient: string;
  instruction: string;
  brandKit: BrandKit;
  previousSubject?: string;
  previousBody?: string;
  refinement?: string;
  originalMail?: { subject: string | null; body: string | null };
}

export interface MailDraftOutput {
  subject: string;
  body: string;
}

function systemPrompt(brandKit: BrandKit): string {
  return [
    'Du bist der professionelle E-Mail-Assistent für Fly & Froth — ein Grafik-',
    'und Webdesignstudio in Karben (Frankfurt-Region). Inhaber: Mehmet Genco.',
    '',
    'Deine Aufgabe: Aus einer kurzen Anweisung und einer E-Mail-Adresse eine',
    'fertige, sendbare E-Mail (Betreff + Text) verfassen.',
    '',
    'Markenton:',
    brandKit.text_tone_guide,
    '',
    'Sprache der ausgehenden E-Mail (Reihenfolge der Prioritäten):',
    '1. Wenn die Anweisung eine explizite Sprachvorgabe enthält',
    '   ("auf Deutsch", "in English", "Türkçe yaz", "ingilizce yaz",',
    '   "Almanca yaz", "İngilizce", "in German" usw.) → diese Sprache verwenden.',
    '2. Sonst E-Mail-Domain prüfen:',
    '   - .de / .at / .ch / .eu → Deutsch',
    '   - .com.tr / .net.tr / .org.tr → Türkisch',
    '   - .uk / .us / .ca / .au / .ie → Englisch',
    '3. Wenn Domain neutral ist (z. B. .com, .org): **Standard ist Deutsch.**',
    '   Die Anweisungssprache ist NICHT relevant — der Nutzer schreibt oft',
    '   auf Türkisch an den Bot, möchte die E-Mail aber auf Deutsch.',
    '',
    'Stilregeln:',
    '- Höfliche, geschäftliche Anrede mit Namen falls erkennbar; sonst neutral.',
    '- Kurz und konkret. Keine Floskeln, kein "Ich hoffe, es geht Ihnen gut".',
    '- Keine Erwähnung von KI, Bots, Automatisierung oder "im Auftrag von".',
    '- Keine Emojis im Betreff. Maximal 1 Emoji im Text, nur wenn es passt.',
    '- Keine Hashtags. Kein Markdown. Reiner Text.',
    '- Schluss mit Vorname / "Mehmet Genco — Fly & Froth", außer Nutzer gibt anderes vor.',
    `- Niemals diese Wörter verwenden: ${brandKit.negative_words.join(', ')}`,
    '',
    'Output-Format:',
    'Antworte STRIKT als JSON-Objekt mit genau zwei Feldern:',
    '{"subject": "<Betreffzeile>", "body": "<vollständiger Mailtext mit \\n für Zeilenumbrüche>"}',
    'Keine Erklärung, keine Codefences, kein Vorwort.',
  ].join('\n');
}

function userPrompt(input: GenerateMailDraftInput): string {
  const parts: string[] = [];
  parts.push(`Empfänger: ${input.recipient}`);
  parts.push('');
  if (input.originalMail) {
    parts.push('Du beantwortest folgende E-Mail des Empfängers:');
    parts.push(`Betreff: ${input.originalMail.subject ?? '(ohne Betreff)'}`);
    parts.push('Text:');
    parts.push(`"""${(input.originalMail.body ?? '').slice(0, 2000)}"""`);
    parts.push('');
  }
  parts.push('Anweisung:');
  parts.push(`"""${input.instruction}"""`);
  if (input.previousSubject || input.previousBody) {
    parts.push('');
    parts.push('Vorheriger Entwurf:');
    if (input.previousSubject) parts.push(`Betreff: ${input.previousSubject}`);
    if (input.previousBody) parts.push(`Text:\n${input.previousBody}`);
  }
  if (input.refinement) {
    parts.push('');
    parts.push('Anpassungswunsch des Nutzers:');
    parts.push(`"""${input.refinement}"""`);
    parts.push(
      'Wende die Anpassung auf den vorherigen Entwurf an und gib das Ergebnis zurück.',
    );
  } else {
    parts.push('');
    parts.push('Schreibe jetzt die E-Mail.');
  }
  return parts.join('\n');
}

function parseJsonResponse(text: string): MailDraftOutput {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as { subject?: unknown; body?: unknown };
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Mail draft JSON missing subject/body string fields');
  }
  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}

export async function generateMailDraft(
  input: GenerateMailDraftInput,
): Promise<MailDraftOutput> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: systemPrompt(input.brandKit),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt(input) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Claude mail draft response');
  }
  return parseJsonResponse(block.text);
}
