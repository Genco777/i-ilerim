import { describe, it, expect } from 'vitest';
import {
  isKleinanzeigenSender,
  extractRoutingToken,
  parseKleinanzeigenBody,
} from '@/lib/kleinanzeigen/detector';

const SAMPLE_FROM = '7hh14s6jg562j-4c732689b1cd43bcdc7e20861be57c4d3b1dd3e-ek-ek@mail.kleinanzeigen.de';
const NON_KA = 'newsletter@randomshop.de';

describe('isKleinanzeigenSender', () => {
  it('matches a Kleinanzeigen routing address', () => {
    expect(isKleinanzeigenSender(SAMPLE_FROM)).toBe(true);
  });
  it('matches mixed case', () => {
    expect(isKleinanzeigenSender(SAMPLE_FROM.toUpperCase())).toBe(true);
  });
  it('does not match other senders', () => {
    expect(isKleinanzeigenSender(NON_KA)).toBe(false);
  });
  it('does not match empty string', () => {
    expect(isKleinanzeigenSender('')).toBe(false);
  });
});

describe('extractRoutingToken', () => {
  it('returns the local-part of a Kleinanzeigen address', () => {
    expect(extractRoutingToken(SAMPLE_FROM)).toBe(
      '7hh14s6jg562j-4c732689b1cd43bcdc7e20861be57c4d3b1dd3e-ek-ek',
    );
  });
  it('returns null for non-Kleinanzeigen senders', () => {
    expect(extractRoutingToken(NON_KA)).toBeNull();
  });
});

describe('parseKleinanzeigenBody', () => {
  it('extracts buyer name and listing title from a typical notification body', () => {
    const body = `Hallo Mehmet,

du hast eine Nachricht von Jessy zu deiner Anzeige "Logo-Vektorisierung & Animation" erhalten:

---
Hi, kannst du mir mein JPG vektorisieren? Wie lange dauert das? Und kannst du auch Animation dazu machen?
---

Antworte dieser E-Mail direkt, um Jessy zu antworten.`;
    const parsed = parseKleinanzeigenBody(body);
    expect(parsed.buyerName).toBe('Jessy');
    expect(parsed.listingTitle).toBe('Logo-Vektorisierung & Animation');
    expect(parsed.message).toContain('JPG vektorisieren');
    expect(parsed.message).not.toContain('---');
    expect(parsed.message).not.toContain('Antworte dieser E-Mail');
  });

  it('falls back to full body when delimiters are missing', () => {
    const body = 'Some arbitrary email body without the usual template.';
    const parsed = parseKleinanzeigenBody(body);
    expect(parsed.buyerName).toBeNull();
    expect(parsed.listingTitle).toBeNull();
    expect(parsed.message).toBe(body);
  });

  it('handles empty body gracefully', () => {
    const parsed = parseKleinanzeigenBody('');
    expect(parsed.message).toBe('');
  });

  it('handles CRLF line endings', () => {
    const body =
      'Nachricht von Jessy zu deiner Anzeige "Test"\r\n\r\n---\r\nHello buyer\r\n---\r\n';
    const parsed = parseKleinanzeigenBody(body);
    expect(parsed.buyerName).toBe('Jessy');
    expect(parsed.listingTitle).toBe('Test');
    expect(parsed.message).toBe('Hello buyer');
  });
});
