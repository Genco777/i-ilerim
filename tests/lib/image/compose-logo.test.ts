import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { composeLogo } from '@/lib/image/compose-logo';
import type { BrandKit } from '@/types';

const fixtures = path.join(__dirname, '../../fixtures');

const baseKit: BrandKit = {
  id: 1,
  logo_url: 'file://' + path.join(fixtures, 'test-logo-200.png'),
  logo_position: 'bottom_right',
  logo_size_pct: 18,
  logo_opacity: 0.85,
  logo_padding_px: 40,
  manual_upload_logo_default: 'ask',
  brand_colors: ['#050912', '#d4a43a'],
  visual_style_guide: '',
  text_tone_guide: '',
  negative_words: [],
  updated_at: new Date(),
};

describe('composeLogo', () => {
  let baseImage: Buffer;

  beforeAll(async () => {
    baseImage = await fs.readFile(
      path.join(fixtures, 'test-image-1024.png'),
    );
  });

  it('returns valid PNG when logo_position=none (no overlay)', async () => {
    const out = await composeLogo(baseImage, {
      ...baseKit,
      logo_position: 'none',
    });
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1024);
  });

  it('overlays logo and produces 1024x1024 PNG', async () => {
    const out = await composeLogo(baseImage, baseKit);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it('handles all 4 corner positions without throwing', async () => {
    const corners = [
      'bottom_right',
      'bottom_left',
      'top_right',
      'top_left',
    ] as const;
    for (const pos of corners) {
      const out = await composeLogo(baseImage, {
        ...baseKit,
        logo_position: pos,
      });
      const meta = await sharp(out).metadata();
      expect(meta.width).toBe(1024);
      expect(meta.height).toBe(1024);
    }
  });

  it('respects different logo_size_pct values', async () => {
    const out = await composeLogo(baseImage, {
      ...baseKit,
      logo_size_pct: 30,
    });
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(1024);
  });
});
