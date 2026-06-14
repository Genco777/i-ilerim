import type { KleinanzeigenAnalysis } from '@/types';
import type { ConversationTurn } from '@/lib/db/queries/kleinanzeigen';

export function formatConversationHistory(history: ConversationTurn[]): string {
  if (history.length === 0) return '';
  const lines: string[] = ['', 'KONUŞMA GEÇMİŞİ (eski → yeni):'];
  for (const turn of history) {
    const buyer = turn.buyerMessage.slice(0, 800);
    const ours = turn.ourReply.slice(0, 800);
    lines.push('');
    lines.push(`ALICI: ${buyer}`);
    lines.push(`SEN: ${ours}`);
  }
  return lines.join('\n');
}

export function analysisSystemPrompt(profile: string): string {
  return [
    'Sen Fly & Froth (Grafik & Webdesign, Karben/DE) için',
    'Kleinanzeigen alıcı mesajlarını analiz eden bir asistansın.',
    '',
    'GÖREVİN: alıcının mesajını oku, JSON ile özetle.',
    '',
    'İŞLETME PROFİLİ (Almanca, otoritedir):',
    '---',
    profile,
    '---',
    '',
    'OUTPUT formatı (sadece JSON, açıklama yok):',
    '{',
    '  "subject": "kısa konu etiketi, max 6 kelime, Türkçe",',
    '  "lang": "de|en|tr|other",',
    '  "tone_detected": "du|Sie|unknown",',
    '  "knowledge_gaps": ["slug-1", "slug-2"]',
    '}',
    '',
    'knowledge_gaps: profilde TANIMLI OLMAYAN ve alıcının açıkça',
    'sorduğu hizmet/konu varsa slug-isimleri (lowercase, tireli).',
    'Profilde varsa BOŞ array dön. Tahmine değil; net eksiklik olmalı.',
  ].join('\n');
}

export function analysisUserPrompt(
  buyerMessage: string,
  history?: ConversationTurn[],
): string {
  const historyBlock = history && history.length > 0 ? formatConversationHistory(history) + '\n' : '';
  return [historyBlock, 'ALICI MESAJI (yeni):', '"""', buyerMessage, '"""', '', 'JSON output:'].join('\n');
}

export function replySystemPrompt(profile: string): string {
  return [
    'Sen Fly & Froth (Mehmet Genco) adına Kleinanzeigen alıcılarına',
    'kısa cevap yazıyorsun.',
    '',
    'KURALLAR:',
    '- Cevabı alıcının diliyle yaz (genelde Almanca).',
    '- tone_detected "du" ise du, "Sie" ise Sie. "unknown" ise du.',
    '- Stil: rahat, samimi, kurumsal değil — Kleinanzeigen tonu.',
    '- 2-5 cümle, kısa tut. Hashtag yok.',
    '- Profilde varsa kesin fiyat/süre kullan; yoksa UYDURMA.',
    '- Profilde olmayan bir hizmet sorulduysa nazikçe bilgi iste',
    '  veya yönlendir. Bir bilgi varsa override\'tan kullan.',
    '- İmzayı override\'taki "signature" girdisinden kullan; yoksa',
    '  "Liebe Grüße, Mehmet".',
    '- SADECE cevap metnini yaz, açıklama veya JSON yok.',
    '',
    'İŞLETME PROFİLİ:',
    '---',
    profile,
    '---',
  ].join('\n');
}

export interface ReplyContext {
  buyerName: string | null;
  listingTitle: string | null;
  buyerMessage: string;
  analysis: KleinanzeigenAnalysis;
  history?: ConversationTurn[];
}

export function replyUserPrompt(ctx: ReplyContext): string {
  const historyBlock = ctx.history && ctx.history.length > 0
    ? formatConversationHistory(ctx.history) + '\n'
    : '';
  return [
    `ALICI: ${ctx.buyerName ?? '(bilinmiyor)'}`,
    `İLAN: ${ctx.listingTitle ?? '(bilinmiyor)'}`,
    '',
    'PRE-ANALİZ:',
    JSON.stringify(ctx.analysis, null, 2),
    historyBlock,
    'ALICI MESAJI (yeni):',
    '"""',
    ctx.buyerMessage,
    '"""',
    '',
    'Cevabı yaz (geçmiş varsa onunla tutarlı kal):',
  ].join('\n');
}

export function alternativesUserPrompt(ctx: ReplyContext): string {
  return [
    replyUserPrompt(ctx),
    '',
    'Bu sefer 3 FARKLI varyasyon üret. Output JSON array:',
    '[',
    '  {"label": "Kısa & rahat", "text": "..."},',
    '  {"label": "Detaylı + fiyat", "text": "..."},',
    '  {"label": "Önce soru sor", "text": "..."}',
    ']',
    '',
    'Sadece JSON, başka hiçbir şey yazma.',
  ].join('\n');
}

export function refinementUserPrompt(args: {
  ctx: ReplyContext;
  previousReply: string;
  feedback: string;
}): string {
  return [
    replyUserPrompt(args.ctx),
    '',
    'ÖNCEKİ CEVAP TASLAĞIN:',
    '"""',
    args.previousReply,
    '"""',
    '',
    'KULLANICI GERİBİLDİRİMİ:',
    args.feedback,
    '',
    'Bu geribildirime göre cevabı yeniden yaz:',
  ].join('\n');
}
