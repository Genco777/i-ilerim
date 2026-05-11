import { db } from '@/lib/db';
import { brandKit } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { BrandKit, NewBrandKit } from '@/types';

const DEFAULT_VISUAL = `photorealistic, high-end professional photography style, premium German design studio Fly & Froth, gold accent, dark elegant mood, cinematic lighting, natural depth of field, no text in image, dynamic composition, looks like a real photograph not AI-generated, engaging and informative visual storytelling.

SERVICE-SPECIFIC GOLD ACCENTS:
- Webdesign posts: #d4a43a Classic Gold — subtle gold reflections on screens, warm golden ambient light
- Logodesign posts: #c9a96e Pale Gold — softer, more refined gold, elegant paper textures
- Flyerdesign posts: #b8943a Burnished Brass — warm brass tones, tactile paper feel
- Druckdesign posts: #a08040 Bronze — deeper metallic, industrial yet premium
- Brand/Insight posts: #d4a43a Classic Gold — authoritative gold, rich contrast
- Local posts: #d4a43a Classic Gold — city skyline with warm golden glow
- Reel covers: #d4a43a Classic Gold — bold, high-contrast, striking`;

const DEFAULT_TONE = `Du schreibst für Fly & Froth, ein Grafik- und Webdesignstudio in Karben (Frankfurt-Region). Inhaber: Mehmet Genco. Ton: kompetent, freundlich, präzise. Maximal 2 Emojis pro Beitrag. Hashtags am Ende, 5-8 Stück, Karben/Frankfurt-fokussiert. Verwende nicht 'günstig' oder 'billig' — stattdessen 'fair' oder 'transparent'. Schließe immer mit Call-to-Action.

FIRMA DATEN (immer faktenbasiert schreiben):
- Gegründet 2020, Inhabergeführt
- 850+ abgeschlossene Projekte
- Google-Bewertung: 5,0/5 (10+ Rezensionen)
- Standort: Röderweg 19, 61184 Karben (bei Frankfurt am Main)
- Reaktionszeit: innerhalb 12 Stunden, auch am Wochenende
- Tel: +49 163 1474127, E-Mail: info@fly-froth.com
- Instagram: @fly.froth

LEISTUNGEN & PREISE (nur erwähnen wenn zum Thema passend):
- Webdesign: ab 490€, responsive, SEO-Grundoptimierung, 7-14 Werktage, bis 5 Unterseiten
- Logodesign: Basic ab 79€ (5 Tage), Express ab 129€ (24 Stunden), PNG/JPG/EPS/AI/PDF
- Flyerdesign: ab 49€ einseitig / 79€ beidseitig, 1-2 Werktage Design
- Visitenkartendesign & weitere Druckprodukte
- Corporate Identity Komplettpakete

EINZUGSGEBIET (19+ Städte, Rhein-Main Region):
Karben, Frankfurt am Main, Bad Vilbel, Friedberg (Hessen), Hanau, Bad Homburg, Oberursel, Kronberg, Königstein, Bad Soden, Eschborn, Hofheim, Bad Nauheim, Butzbach, Niddatal, Rosbach, Wöllstadt, Nidderau, Bruchköbel — bundesweit digital erreichbar.

USPs (natürlich im Text verteilen, nicht als Liste):
- Inhaber ist selbst Designer (kein anonymer Konzern)
- Express-Lieferung möglich (Logo in 24h)
- Komplettpaket: Design + Druck + Lieferung aus einer Hand
- 5,0/5 Google — echte Kundenbewertungen
- Fair und transparent (keine versteckten Kosten)
- Deutschsprachiger Direktkontakt, WhatsApp verfügbar`;

export async function getBrandKit(): Promise<BrandKit> {
  const rows = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.id, 1))
    .limit(1);

  const row = rows[0];

  // Existing row with logo — nothing to fix
  if (row?.logo_url) return row;

  const logoDefaults = {
    logo_url: '/branding/logo-dark.png',
    logo_position: 'bottom_right' as const,
    logo_size_pct: 12.0,
    logo_opacity: 0.88,
    logo_padding_px: 28,
  };

  // Existing row but missing logo_url — patch it
  if (row) {
    const patch = { ...logoDefaults, updated_at: new Date() };
    await db.update(brandKit).set(patch).where(eq(brandKit.id, 1));
    return { ...row, ...patch };
  }

  // No row yet — seed
  const seed: NewBrandKit = {
    id: 1,
    ...logoDefaults,
    visual_style_guide: DEFAULT_VISUAL,
    text_tone_guide: DEFAULT_TONE,
    brand_colors: ['#050912', '#d4a43a'],
    negative_words: ['günstig', 'billig', 'schnellschuss'],
  };
  const [created] = await db.insert(brandKit).values(seed).returning();
  if (!created) {
    throw new Error('Failed to seed brand kit');
  }
  return created;
}

export async function updateBrandKit(
  patch: Partial<NewBrandKit>,
): Promise<BrandKit> {
  const [updated] = await db
    .update(brandKit)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(brandKit.id, 1))
    .returning();
  if (!updated) {
    throw new Error('Brand kit row missing — call getBrandKit() first to seed');
  }
  return updated;
}
