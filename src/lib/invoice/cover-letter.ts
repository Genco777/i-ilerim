import Anthropic from '@anthropic-ai/sdk';
import type { BrandKit } from '@/types';
import { formatCents, type InvoiceData } from './types';

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

export interface InvoiceCoverLetter {
  subject: string;
  body: string;
}

function systemPrompt(brandKit: BrandKit): string {
  return [
    'Du verfasst kurze, geschäftliche deutsche E-Mails, die eine Rechnung als',
    'PDF-Anhang ankündigen. Der Empfänger ist ein Kunde von Fly & Froth — einem',
    'Grafik- und Webdesignstudio in Karben (Inhaber: Mehmet Genco).',
    '',
    'Markenton:',
    brandKit.text_tone_guide,
    '',
    'Stilregeln:',
    '- Höfliche Anrede (Sehr geehrte/r [Name]) wenn Name vorhanden, sonst neutral',
    '- 2-4 Sätze, kein Smalltalk, keine Floskeln',
    '- Klare Information: Rechnungsnummer, Betrag, dass die PDF anbei ist',
    '- Kein Hinweis auf KI/Bot/Automation',
    '- Schluss mit "Mit freundlichen Grüßen" + "Mehmet Genco — Fly & Froth"',
    '- Reiner Text, kein Markdown, keine Hashtags',
    `- Niemals diese Wörter verwenden: ${brandKit.negative_words.join(', ')}`,
    '',
    'Output-Format:',
    'Antworte STRIKT als JSON-Objekt mit genau zwei Feldern:',
    '{"subject": "<Betreffzeile>", "body": "<vollständiger Mailtext mit \\n>"}',
    'Keine Erklärung, keine Codefences.',
  ].join('\n');
}

function userPrompt(invoice: InvoiceData): string {
  const recipientName = invoice.recipient.company
    ? `${invoice.recipient.company} (${invoice.recipient.name})`
    : invoice.recipient.name;

  const itemsList = invoice.items
    .map(
      (it) =>
        `  - ${it.description} (${it.quantity}× ${formatCents(it.unitPriceCents)}€)`,
    )
    .join('\n');

  const labelMap: Record<InvoiceData['type'], string> = {
    rechnung: 'Rechnung',
    teilrechnung: 'Teilrechnung',
    schlussrechnung: 'Schlussrechnung',
    angebot: 'Angebot',
  };

  return [
    `Empfänger: ${recipientName}`,
    `Rechnungstyp: ${labelMap[invoice.type]}`,
    `Rechnungsnummer: ${invoice.number}`,
    `Datum: ${invoice.date}`,
    `Gesamtbetrag: ${formatCents(invoice.totalCents)} €`,
    'Positionen:',
    itemsList,
    invoice.footerNote ? `\nNotiz: ${invoice.footerNote}` : '',
    '',
    'Schreibe jetzt die kurze Begleitmail. Der Betreff sollte enthalten:',
    `"${labelMap[invoice.type]} Nr. ${invoice.number}".`,
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

function parseResponse(text: string): InvoiceCoverLetter {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned) as { subject?: unknown; body?: unknown };
  if (typeof parsed.subject !== 'string' || typeof parsed.body !== 'string') {
    throw new Error('Cover letter JSON missing subject/body');
  }
  return { subject: parsed.subject.trim(), body: parsed.body.trim() };
}

export async function generateInvoiceCoverLetter(
  invoice: InvoiceData,
  brandKit: BrandKit,
): Promise<InvoiceCoverLetter> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [
      {
        type: 'text',
        text: systemPrompt(brandKit),
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt(invoice) }],
  });
  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in cover-letter response');
  }
  return parseResponse(block.text);
}
