import type { KleinanzeigenThread, KleinanzeigenAnalysis } from '@/types';

const MAX_RAW = 1800;

export function buildInitialMessage(thread: KleinanzeigenThread): string {
  const a = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const header = thread.listing_title
    ? `📩 ${thread.listing_title} — ${thread.buyer_name ?? '(bilinmiyor)'}`
    : `📩 Kleinanzeigen mesajı — ${thread.buyer_name ?? '(bilinmiyor)'}`;
  const body = thread.raw_body.slice(0, MAX_RAW);
  const tagLine = a
    ? `🏷️ ${a.subject} · 🌍 ${a.lang.toUpperCase()} · 🗣 ${a.tone_detected}`
    : '🏷️ (analiz yok)';
  const gapLine =
    a && a.knowledge_gaps.length > 0
      ? `⚠️ Bilgi boşluğu: ${a.knowledge_gaps.join(', ')}`
      : null;
  return [
    header,
    '──────────────────────────',
    body,
    '──────────────────────────',
    tagLine,
    gapLine ?? '',
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

export function buildPreviewMessage(
  thread: KleinanzeigenThread,
  draft: string,
  source: 'ai' | 'custom' | 'regen' = 'ai',
  historyCount = 0,
): string {
  const a = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const meta = a ? `(${a.tone_detected} · ${a.lang.toUpperCase()})` : '';
  const headerByType: Record<'ai' | 'custom' | 'regen', string> = {
    ai: '💡 Önerilen cevap',
    custom: '✏️ Senin cevabın',
    regen: '🔄 Yeniden üretilen cevap',
  };
  const attachCount = (thread.attachments ?? []).length;
  const attachLine =
    attachCount > 0
      ? `\n📎 Eklenen görseller: ${(thread.attachments ?? [])
          .map((a) => a.filename)
          .join(', ')}\n`
      : '';
  const historyLine = historyCount > 0 ? `📚 ${historyCount} önceki mesaj kullanıldı\n` : '';
  return [
    `${headerByType[source]} ${meta}`,
    historyLine,
    attachLine,
    '',
    draft,
  ]
    .join('\n')
    .slice(0, 4000);
}

export function buildGapPrompt(topic: string): string {
  return [`📚 "${topic}" hakkında profilde bilgi yok.`, '', 'Ne yapmak istersin?'].join('\n');
}

export function buildGapInfoPrompt(topic: string): string {
  return [`📚 "${topic}" detaylarını yaz:`, '(fiyat, süre, format, sınırlamalar — kısa)'].join('\n');
}

export function buildAlternativesMessage(alts: { label: string; text: string }[]): string {
  const lines: string[] = ['🤔 3 alternatif:\n'];
  alts.forEach((a, idx) => {
    lines.push(`(${idx + 1}) ${a.label}:`);
    lines.push(a.text);
    lines.push('');
  });
  return lines.join('\n').slice(0, 4000);
}
