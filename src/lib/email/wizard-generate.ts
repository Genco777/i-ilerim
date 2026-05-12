import Anthropic from '@anthropic-ai/sdk';
import type { CampaignConcept, PortfolioItemWizard } from './wizard-cache';
import type { ThemeId } from './themes';

const MODEL = 'claude-sonnet-4-6';

function themeTone(theme: ThemeId): string {
  switch (theme) {
    case 'dark_gold':
      return 'warm, einladend, leicht luxuriös';
    case 'light_steel':
      return 'klar, professionell, modern-kühl';
    default:
      return 'selbstbewusst, premium, modern';
  }
}

// ── Digest content (weekly newsletter) ──

export interface DigestContent {
  subjectLine: string;
  introText: string;
  closingText: string;
  portfolioItems: PortfolioItemWizard[];
}

export async function generateDigestContent(
  selectedItems: PortfolioItemWizard[],
  theme: ThemeId,
  week?: number,
): Promise<DigestContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const itemList = selectedItems
    .map((item, i) => `${i + 1}. [${item.serviceType}] ${item.topic}`)
    .join('\n');

  const system = [
    'Du schreibst Email-Marketing-Texte für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Rhein-Main).',
    'Die Marke: über 850 Projekte, 5,0 Google-Bewertung, faire Preise, Express 24h möglich.',
    `Tonalität: ${themeTone(theme)}.`,
    'Deutsch. Keine Anreden wie "Liebe Kunden". Direkt, modern, kein Werbesprech.',
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 60 Zeichen)",',
    '  "introText": "2-3 Sätze Einleitung",',
    '  "closingText": "1 Satz Abschluss mit Call-to-Action",',
    '  "itemTexts": [',
    '    { "headline": "...", "description": "2 Sätze", "cta": "..." }',
    '  ]',
    '}',
  ].join('\n');

  const user = [
    `Folgende Portfolio-Projekte sind im Newsletter (KW${week ?? '?'}):`,
    itemList,
    '',
    'Schreibe einzigartige Texte — keine Wiederholungen zu früheren Wochen.',
  ].join('\n');

  const raw = await client.messages
    .create({
      model: MODEL,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }],
    })
    .then((r) => {
      const block = r.content[0];
      if (!block || block.type !== 'text') throw new Error('No text from Claude');
      return block.text;
    });

  const parsed = JSON.parse(raw);
  const itemTexts: Array<{ headline: string; description: string; cta: string }> =
    parsed.itemTexts ?? [];

  return {
    subjectLine: parsed.subjectLine ?? 'Fly & Froth Weekly — Neue Projekte & Ideen',
    introText:
      parsed.introText ??
      'Diese Woche bei Fly & Froth: frische Design-Arbeiten aus Karben.',
    closingText:
      parsed.closingText ??
      'Alle Angebote mit Express 24h. Wir freuen uns auf dein Projekt.',
    portfolioItems: selectedItems.map((item, i) => ({
      ...item,
      headline: itemTexts[i]?.headline ?? item.headline,
      description: itemTexts[i]?.description ?? item.description,
      cta: itemTexts[i]?.cta ?? item.cta,
    })),
  };
}

// ── Outreach content (local business) ──

export interface OutreachContent {
  subjectLine: string;
  headline: string;
  bodyText: string;
  ctaLabel: string;
}

export async function generateOutreachContent(
  city: string,
  service: string,
  theme: ThemeId,
): Promise<OutreachContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = [
    'Du schreibst eine Kaltakquise-Email für Fly & Froth, ein Grafik- und Webdesign-Studio.',
    `Tonalität: ${themeTone(theme)}. Kurz, respektvoll, nicht aufdringlich.`,
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 50 Zeichen, NICHT mit "Fly & Froth" starten)",',
    '  "headline": "Überschrift (5-8 Wörter)",',
    '  "bodyText": "2-3 kurze Sätze, keine Übertreibungen",',
    '  "ctaLabel": "Button-Text (2-3 Wörter)"',
    '}',
  ].join('\n');

  const user = [
    `Stadt: ${city}. Angebotener Service: ${service}.`,
    'Schreibe eine lokale Business-Email. Kein "Sehr geehrte", direkt und modern.',
  ].join('\n');

  const raw = await client.messages
    .create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    })
    .then((r) => {
      const block = r.content[0];
      if (!block || block.type !== 'text') throw new Error('No text from Claude');
      return block.text;
    });

  const parsed = JSON.parse(raw);
  return {
    subjectLine: parsed.subjectLine ?? `Design-Service für ${city}`,
    headline:
      parsed.headline ??
      `Professionelles Design aus Karben — für ${city}`,
    bodyText:
      parsed.bodyText ??
      `Fly & Froth ist dein lokales Design-Studio für ${service}. Über 850 Projekte, faire Preise, persönliche Betreuung.`,
    ctaLabel: parsed.ctaLabel ?? 'Jetzt anfragen',
  };
}

// ── Reactivation content ──

export interface ReactivationContent {
  subjectLine: string;
  bodyText: string;
}

export async function generateReactivationContent(
  clientName: string,
  lastProject: string,
  theme: ThemeId,
): Promise<ReactivationContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = [
    'Du schreibst eine Reaktivierungs-Email für Fly & Froth.',
    `Tonalität: ${themeTone(theme)}. Persönlich, warm, nicht aufdringlich.`,
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 50 Zeichen)",',
    '  "bodyText": "3-4 Sätze, persönlich, mit echtem Interesse"',
    '}',
  ].join('\n');

  const user = [
    `Kunde: ${clientName}. Letztes Projekt: ${lastProject}.`,
    'Schreibe eine persönliche Reaktivierungs-Email. Kein "Sehr geehrte", direkt mit Vornamen ansprechen.',
  ].join('\n');

  const raw = await client.messages
    .create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    })
    .then((r) => {
      const block = r.content[0];
      if (!block || block.type !== 'text') throw new Error('No text from Claude');
      return block.text;
    });

  const parsed = JSON.parse(raw);
  return {
    subjectLine: parsed.subjectLine ?? `Wieder von dir hören, ${clientName}!`,
    bodyText:
      parsed.bodyText ??
      `Hallo ${clientName}, dein ${lastProject} ist schon eine Weile her. Wir haben uns weiterentwickelt und würden uns freuen, wieder von dir zu hören.`,
  };
}

// ── Concept Generation ──

const FIRMEN_INFO = `Fly & Froth — Grafik & Webdesign Studio, Karben (Rhein-Main)
Hizmetler: Webdesign (499€+), Logodesign (79€+), Druckdesign/Flyer/Visitenkarten (29€+),
Google Business Profil (99€), WhatsApp Business (49€), Online-Terminbuchung (149€), Online-Menü (79€)
USP: 1000+ proje, 5.0 Google (22 yorum), Festpreisgarantie, Express 24h, tek muhatap, %100 memnuniyet
Hedef kitle: Küçük/orta işletmeler, gastronomi, sağlık, el sanatları, Rhein-Main ve Almanya geneli
Website: fly-froth.com | Instagram: @fly.froth`;

export async function generateConcepts(
  campaignType: 'digest' | 'reactivation',
  pastSubjects: string[],
  context?: { clientName?: string; lastProject?: string },
): Promise<CampaignConcept[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const pastBlock = pastSubjects.length > 0
    ? `Geçmiş kampanya konuları (BUNLARI ASLA tekrarlama):\n${pastSubjects.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
    : 'Henüz geçmiş kampanya yok.';

  const contextBlock = campaignType === 'reactivation' && context?.clientName
    ? `Bu bir REAKTİVASYON kampanyası.\nEski müşteri: ${context.clientName}\nSon projesi: ${context.lastProject ?? 'bilinmiyor'}\nKişisel, samimi ama profesyonel ol.`
    : 'Bu bir GENEL BÜLTEN. Mevcut mailing listindeki herkese gidecek.';

  const system = [
    'Sen Fly & Froth için email pazarlama konseptleri üreten bir stratejistsin.',
    '',
    'FİRMA BİLGİSİ:',
    FIRMEN_INFO,
    '',
    'REFERANS: Premium tasarım ajanslarının bülten stratejilerini referans al.',
    'Satış odaklı, profesyonel, özgün. Genel "tasarım ajansı bülteni" gibi olmasın.',
    '',
    pastBlock,
    '',
    contextBlock,
    '',
    '2 FARKLI konsept üret. Her biri FARKLI bir açıdan yaklaşsın.',
    'Örnek açılar: portfolyo vitrini, sektörel trend/ipucu, başarı hikayesi/müşteri yolculuğu, hizmet derinlemesine, sezonluk kampanya, dijital dönüşüm tavsiyesi',
    'Her konsept satışa yönlendirmeli.',
    '',
    'JSON formatında dön:',
    '{',
    '  "concepts": [',
    '    {',
    '      "title": "Konsept başlığı (butonda gösterilecek, max 40 karakter)",',
    '      "angle": "Satış açısı (1 cümle)",',
    '      "subjectLine": "Önerilen konu satırı (max 60 karakter)",',
    '      "introText": "2-3 cümle giriş metni",',
    '      "closingText": "1 cümle kapanış + CTA",',
    '      "portfolioFocus": ["hizmet1", "hizmet2"]',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: '2 email kampanya konsepti üret.' }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const parsed = JSON.parse(raw);
  return (parsed.concepts ?? []).slice(0, 2);
}
