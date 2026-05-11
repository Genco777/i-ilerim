const KA_DOMAIN_RE = /@mail\.kleinanzeigen\.de\s*$/i;

export function isKleinanzeigenSender(from: string | null | undefined): boolean {
  if (!from) return false;
  return KA_DOMAIN_RE.test(from);
}

export function extractRoutingToken(from: string): string | null {
  if (!isKleinanzeigenSender(from)) return null;
  const at = from.indexOf('@');
  if (at <= 0) return null;
  return from.slice(0, at).trim();
}

export interface ParsedKleinanzeigenBody {
  buyerName: string | null;
  listingTitle: string | null;
  message: string;
}

const BUYER_RE = /Nachricht\s+von\s+(.+?)\s+zu\s+deiner\s+Anzeige/iu;
const LISTING_RE = /Anzeige\s+"([^"]+)"/u;
const DELIM_RE = /\n-{3,}\n([\s\S]*?)\n-{3,}\n/;

export function parseKleinanzeigenBody(body: string): ParsedKleinanzeigenBody {
  const trimmed = (body ?? '').trim();
  if (trimmed.length === 0) {
    return { buyerName: null, listingTitle: null, message: '' };
  }
  const buyerMatch = BUYER_RE.exec(trimmed);
  const listingMatch = LISTING_RE.exec(trimmed);
  const delimMatch = DELIM_RE.exec('\n' + trimmed + '\n');
  const message = delimMatch?.[1]?.trim() ?? trimmed;
  return {
    buyerName: buyerMatch?.[1]?.trim() ?? null,
    listingTitle: listingMatch?.[1]?.trim() ?? null,
    message,
  };
}
