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
  return `${brandKit.text_tone_guide}

Verbotene Wörter/Phrasen: ${brandKit.negative_words.join(', ')}

═══ POST-STRUKTUR ═══
Jeder Post folgt dieser Struktur — natürlich, nicht mechanisch:

1. HOOK (1-2 Sätze) — zwingt zum Weiterlesen. Wähle einen dieser Typen:
   • Frage: "Wann hast du zuletzt dein Logo in Schwarz-Weiß gesehen?"
   • Überraschende Aussage: "Die meisten Logos scheitern am Drucker — nicht am Bildschirm."
   • Persönliche Geschichte: "Gestern hat mich ein Kunde um 22 Uhr angerufen, weil sein Flyer falsch gedruckt wurde."
   • Kontra-intuitiv: "Ein teures Logo ist meistens das günstigste, was du kaufen kannst."
   • Zahl/Fakt: "40% mehr Buchungen — das war das Ergebnis nach dem Website-Relaunch."

2. INHALT (2-4 Sätze) — Mehrwert, Geschichte, oder Einblick. Nicht werbend.
   Schreibe in der ersten Person, als Mehmet. Persönlich, direkt, ehrlich.
   Gib echte Information oder erzähle eine echte Situation.

3. CALL-TO-ACTION (1 Satz) — weich und einladend, nie aufdringlich.
   Beispiele: "Wie sieht das bei euch aus?" / "Link in der Bio, wenn ihr mehr sehen wollt."
   / "Schreibt mir gerne, wenn ihr Fragen habt." / "Was denkt ihr?"

═══ TONALITÄT ═══
✅ Persönlich, direkt, wie ein Fachmann der erklärt (nicht verkauft)
✅ Ehrlich — auch über Herausforderungen oder Fehler
✅ Kurze Sätze. Kein Schachtelsatz.
✅ Maximal 1-2 Emojis — dezent, kein Spam
❌ Kein Werbesprech: "Wir bieten...", "Unser Team...", "Kontaktieren Sie uns jetzt!"
❌ Keine leeren Versprechen: "Das Beste in der Region", "Schnell und günstig"
❌ Nicht übertrieben enthusiastisch: "Wir sind so begeistert!!!"

═══ LÄNGE ═══
Feed-Post: 300-600 Zeichen (genug für eine echte Geschichte, nicht nur ein Satz)
Story-Thema: 40-80 Zeichen (kurzer Impuls)

═══ OUTPUT-FORMAT (strikt) ═══
{
  "text": "Der vollständige Post-Text, 300-600 Zeichen, strukturiert wie oben",
  "hashtags": ["tag1", "tag2", ..., "tag8"]
}

Hashtag-Regeln:
- 5-8 Stück, KEINE # im JSON (werden automatisch ergänzt)
- Brand-Tag IMMER dabei: flyfroth
- Mindestens 2 lokale Tags (Karben, Frankfurt, RheinMain, FrankfurtAmMain, oder die genannte Stadt)
- Mindestens 2 service-spezifische Tags passend zum Thema
- 1-2 Trend-Tags (Grafikdesign, Webdesign, Logodesign, Designagentur, etc.)
- Keine Bindestriche in Hashtags`;
}

function userPrompt(topic: string, scheduleHint?: string): string {
  return [
    `Schreibe einen Instagram + Facebook Post zum folgenden Thema: "${topic}"`,
    scheduleHint ? `Kontext: ${scheduleHint}` : '',
    '',
    'Wichtig: Der Post soll echten Mehrwert bieten oder eine Geschichte erzählen — kein Werbetetext.',
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

  let parsed: { text?: unknown; hashtags?: unknown };

  // Try direct parse first
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Claude sometimes returns malformed JSON (unescaped quotes in German text).
    // Attempt repair: extract text and hashtags via regex fallback.
    const textMatch = jsonMatch[0].match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const hashtagsMatch = jsonMatch[0].match(/"hashtags"\s*:\s*\[([^\]]*)\]/);
    if (textMatch && hashtagsMatch && hashtagsMatch[1] !== undefined) {
      const rawTags = hashtagsMatch[1].match(/"([^"]*)"/g)?.map((t) => t.replace(/^"|"$/g, '')) ?? [];
      parsed = { text: textMatch[1], hashtags: rawTags };
    } else {
      throw new Error(`Unparseable Claude JSON at pos: ${raw.slice(0, 300)}`);
    }
  }

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
