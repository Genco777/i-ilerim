import { db } from '@/lib/db';
import { brandKit } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { BrandKit, NewBrandKit } from '@/types';

const DEFAULT_VISUAL = `photorealistic, high-end professional photography style, premium German design studio Fly & Froth, gold accent #d4a43a, dark elegant mood, cinematic lighting, natural depth of field, no text in image, dynamic composition, looks like a real photograph not AI-generated, engaging and informative visual storytelling`;

const DEFAULT_TONE = `Du schreibst für Fly & Froth, ein Grafik- und Webdesignstudio in Karben (Frankfurt-Region). Inhaber: Mehmet Genco. Ton: kompetent, freundlich, präzise. Maximal 2 Emojis pro Beitrag. Hashtags am Ende, 5-8 Stück, Karben/Frankfurt-fokussiert. Verwende nicht 'günstig' oder 'billig' — stattdessen 'fair' oder 'transparent'. Schließe immer mit Call-to-Action.`;

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
