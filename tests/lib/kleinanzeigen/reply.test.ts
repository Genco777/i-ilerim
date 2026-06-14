import { describe, it, expect } from 'vitest';
import { parseAlternativesResponse, cleanReplyText } from '@/lib/kleinanzeigen/reply';

describe('cleanReplyText', () => {
  it('trims and strips wrapping quotes', () => {
    expect(cleanReplyText('  "Hallo Jessy"  ')).toBe('Hallo Jessy');
    expect(cleanReplyText('„Hallo"')).toBe('Hallo');
  });
  it('leaves clean text untouched', () => {
    expect(cleanReplyText('Hallo Jessy, klar!')).toBe('Hallo Jessy, klar!');
  });
});

describe('parseAlternativesResponse', () => {
  it('parses a JSON array of {label, text}', () => {
    const raw = JSON.stringify([
      { label: 'Kısa', text: 'Hi Jessy, klar.' },
      { label: 'Detaylı', text: 'Hallo Jessy, gerne erstelle ich dir...' },
      { label: 'Soru', text: 'Hi Jessy, kannst du mir...' },
    ]);
    const out = parseAlternativesResponse(raw);
    expect(out.length).toBe(3);
    expect(out[0]?.label).toBe('Kısa');
    expect(out[1]?.text).toContain('Hallo Jessy');
  });

  it('strips code fences before parsing', () => {
    const raw = '```json\n[{"label":"X","text":"Y"}]\n```';
    const out = parseAlternativesResponse(raw);
    expect(out.length).toBe(1);
    expect(out[0]?.label).toBe('X');
  });

  it('returns an empty array on malformed input', () => {
    expect(parseAlternativesResponse('not json')).toEqual([]);
  });

  it('drops entries missing label or text', () => {
    const raw = JSON.stringify([
      { label: 'A', text: 'a' },
      { label: '', text: 'b' },
      { text: 'c' },
      { label: 'D', text: '' },
    ]);
    expect(parseAlternativesResponse(raw).length).toBe(1);
  });
});
