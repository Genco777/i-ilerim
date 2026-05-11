import { describe, it, expect } from 'vitest';
import {
  analysisSystemPrompt,
  analysisUserPrompt,
  replySystemPrompt,
  replyUserPrompt,
  alternativesUserPrompt,
  refinementUserPrompt,
} from '@/lib/kleinanzeigen/prompts';

const PROFILE = '# Fly & Froth\n- Logodesign ab 79€';

describe('analysis prompts', () => {
  it('system prompt embeds profile + JSON output requirement', () => {
    const p = analysisSystemPrompt(PROFILE);
    expect(p).toContain('Fly & Froth');
    expect(p).toContain(PROFILE);
    expect(p.toLowerCase()).toContain('json');
    expect(p).toContain('knowledge_gaps');
  });

  it('user prompt embeds the buyer message', () => {
    const u = analysisUserPrompt('Hi, was kostet ein Logo?');
    expect(u).toContain('Hi, was kostet ein Logo?');
  });
});

describe('reply prompts', () => {
  it('system prompt embeds profile and tone rules', () => {
    const p = replySystemPrompt(PROFILE);
    expect(p).toContain(PROFILE);
    expect(p).toContain('du');
    expect(p).toContain('Sie');
  });

  it('user prompt embeds context fields', () => {
    const u = replyUserPrompt({
      buyerName: 'Jessy',
      listingTitle: 'Logodesign',
      buyerMessage: 'Was kostet das?',
      analysis: { subject: 'Logo Preisanfrage', lang: 'de', tone_detected: 'du', knowledge_gaps: [] },
    });
    expect(u).toContain('Jessy');
    expect(u).toContain('Logodesign');
    expect(u).toContain('Was kostet das?');
    expect(u).toContain('"tone_detected": "du"');
  });

  it('alternatives prompt requests JSON array', () => {
    const u = alternativesUserPrompt({
      buyerName: 'Jessy',
      listingTitle: 'Logodesign',
      buyerMessage: 'Was kostet das?',
      analysis: { subject: 'x', lang: 'de', tone_detected: 'du', knowledge_gaps: [] },
    });
    expect(u.toLowerCase()).toContain('json');
    expect(u).toContain('array');
  });

  it('refinement prompt includes previous reply and user feedback', () => {
    const u = refinementUserPrompt({
      ctx: {
        buyerName: 'Jessy',
        listingTitle: 'Logodesign',
        buyerMessage: 'Was kostet das?',
        analysis: { subject: 'x', lang: 'de', tone_detected: 'du', knowledge_gaps: [] },
      },
      previousReply: 'Hi Jessy, kostet 79€.',
      feedback: 'daha kısa yap',
    });
    expect(u).toContain('ÖNCEKİ CEVAP');
    expect(u).toContain('Hi Jessy, kostet 79€.');
    expect(u).toContain('KULLANICI GERİBİLDİRİMİ');
    expect(u).toContain('daha kısa yap');
  });
});
