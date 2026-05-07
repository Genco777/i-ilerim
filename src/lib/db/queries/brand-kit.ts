import { db } from '@/lib/db';
import { brandKit } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { BrandKit, NewBrandKit } from '@/types';

const DEFAULT_VISUAL = `minimal, modern, premium dark aesthetic, gold accent #d4a43a, clean composition, professional German design studio aesthetic, no text, no logos in image, photorealistic, well-lit, centered subject`;

const DEFAULT_TONE = `Du schreibst für Fly & Froth, ein Grafik- und Webdesignstudio in Karben (Frankfurt-Region). Inhaber: Mehmet Genco. Ton: kompetent, freundlich, präzise. Maximal 2 Emojis pro Beitrag. Hashtags am Ende, 5-8 Stück, Karben/Frankfurt-fokussiert. Verwende nicht 'günstig' oder 'billig' — stattdessen 'fair' oder 'transparent'. Schließe immer mit Call-to-Action.`;

export async function getBrandKit(): Promise<BrandKit> {
  const rows = await db
    .select()
    .from(brandKit)
    .where(eq(brandKit.id, 1))
    .limit(1);
  if (rows[0]) return rows[0];

  const seed: NewBrandKit = {
    id: 1,
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
