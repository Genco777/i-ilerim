import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    default: vi.fn().mockImplementation(function (this: any) {
      this.messages = { create };
    }),
  };
});

vi.mock('@/lib/db/queries/brand-kit', () => ({
  getBrandKit: vi.fn(),
}));

import Anthropic from '@anthropic-ai/sdk';
import { generateAdCopy } from '@/lib/google-ads/ads-copy';
import { getBrandKit } from '@/lib/db/queries/brand-kit';

beforeEach(() => {
  vi.mocked(getBrandKit).mockResolvedValue({
    id: 1,
    logo_url: null,
    logo_position: 'bottom_right',
    logo_size_pct: 18,
    logo_opacity: 0.85,
    logo_padding_px: 40,
    manual_upload_logo_default: 'ask',
    brand_colors: ['#050912', '#d4a43a'],
    visual_style_guide: 'modern',
    text_tone_guide: 'Profesyonel ama samimi, Türkçe değil Almanca yaz.',
    negative_words: ['ucuz', 'beleş'],
    updated_at: new Date(),
  });

  const anthropic = new Anthropic({ apiKey: 'test' });
  vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          headlines: [
            'Visitenkarten in 24h',
            'Premium Druck Frankfurt',
            'Webdesign Rhein-Main',
            'Ihr lokaler Designer',
            'Logo & Druck aus einer Hand',
          ],
          descriptions: [
            'Hochwertige Visitenkarten mit Express-Versand in Frankfurt und Umgebung.',
            'Modernes Webdesign für lokale Unternehmen im Rhein-Main-Gebiet.',
            'Kostenloses Erstgespräch — jetzt unverbindlich anfragen.',
          ],
        }),
      },
    ],
  } as unknown as Anthropic.Message);
});

describe('generateAdCopy', () => {
  it('returns 5 headlines and 3 descriptions', async () => {
    const result = await generateAdCopy({
      campaignType: 'search',
      targetUrl: 'https://fly-froth.com/visitenkarten',
      conversionGoal: 'lead_form',
    });
    expect(result.headlines).toHaveLength(5);
    expect(result.descriptions).toHaveLength(3);
  });

  it('enforces Google length limits (headlines ≤30, descriptions ≤90)', async () => {
    const result = await generateAdCopy({
      campaignType: 'search',
      targetUrl: 'https://fly-froth.com/visitenkarten',
      conversionGoal: 'lead_form',
    });
    for (const h of result.headlines) expect(h.length).toBeLessThanOrEqual(30);
    for (const d of result.descriptions) expect(d.length).toBeLessThanOrEqual(90);
  });
});
