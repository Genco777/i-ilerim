import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '@/lib/kleinanzeigen/analyzer';

describe('parseAnalysisResponse', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({ subject: 'Logo Anfrage', lang: 'de', tone_detected: 'du', knowledge_gaps: [] });
    const out = parseAnalysisResponse(raw);
    expect(out.subject).toBe('Logo Anfrage');
    expect(out.lang).toBe('de');
    expect(out.tone_detected).toBe('du');
    expect(out.knowledge_gaps).toEqual([]);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"subject":"x","lang":"de","tone_detected":"Sie","knowledge_gaps":["animation"]}\n```';
    const out = parseAnalysisResponse(raw);
    expect(out.knowledge_gaps).toEqual(['animation']);
    expect(out.tone_detected).toBe('Sie');
  });

  it('coerces tone_detected to "unknown" on unexpected value', () => {
    const raw = JSON.stringify({ subject: 'x', lang: 'de', tone_detected: 'casual', knowledge_gaps: [] });
    expect(parseAnalysisResponse(raw).tone_detected).toBe('unknown');
  });

  it('returns a safe fallback when JSON is malformed', () => {
    const out = parseAnalysisResponse('not json at all');
    expect(out.subject).toBe('Kleinanzeigen Nachricht');
    expect(out.lang).toBe('de');
    expect(out.tone_detected).toBe('unknown');
    expect(out.knowledge_gaps).toEqual([]);
  });

  it('coerces knowledge_gaps to an array of trimmed strings', () => {
    const raw = JSON.stringify({
      subject: 'x',
      lang: 'de',
      tone_detected: 'du',
      knowledge_gaps: ['  animation  ', 42, ''],
    });
    const out = parseAnalysisResponse(raw);
    expect(out.knowledge_gaps).toEqual(['animation']);
  });
});
