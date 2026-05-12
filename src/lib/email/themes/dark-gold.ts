import { baseLayout, TYPO } from './base';
import type { ThemeContent } from './index';

const BG = '#050912';
const CARD = '#0a0f1e';
const ACCENT = '#d4a43a';
const ACCENT_HOVER = '#b8943a';
const HEADING = '#fafafa';
const BODY = '#b0b8c4';
const MUTED = '#8890a0';
const BORDER = 'rgba(212,164,58,0.15)';
const FONT = 'Outfit, system-ui, sans-serif';

function renderSection(s: ThemeContent['sections'][number]): string {
  switch (s.type) {
    case 'portfolio-card':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:rgba(255,255,255,0.03);border-radius:8px;border:1px solid ${BORDER};">
      <tr><td style="padding:20px 24px;">
        <span style="color:${ACCENT};${TYPO.eyebrow}">${s.subtitle ?? ''}</span>
        <h2 style="color:${HEADING};font-family:${FONT};font-size:18px;${TYPO.heading};margin:8px 0 6px;">${s.title ?? ''}</h2>
        <p style="color:${BODY};font-family:${FONT};font-size:14px;${TYPO.body};margin:0 0 12px;">${s.bodyHtml}</p>
        ${s.ctaLabel ? `<a href="${s.ctaUrl ?? 'https://fly-froth.com/kontakt'}" style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,${ACCENT},${ACCENT_HOVER});color:${BG};text-decoration:none;${TYPO.cta};border-radius:6px;">${s.ctaLabel}</a>` : ''}
      </td></tr>
    </table>`;
    case 'digest-item':
      return `
    <p style="color:${BODY};font-family:${FONT};font-size:14px;${TYPO.body};margin:0 0 6px;padding-left:12px;border-left:2px solid ${ACCENT}50;">
      ${s.subtitle ? `<span style="color:${ACCENT};">${s.subtitle}</span> ` : ''}${s.bodyHtml}
    </p>`;
    case 'usp-list':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${s.bodyHtml.split('\n').filter(Boolean).map(line => `
      <tr><td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
        <span style="color:${ACCENT};">&#10003;</span>
        <span style="color:${BODY};font-family:${FONT};font-size:14px;margin-left:8px;">${line}</span>
      </td></tr>`).join('')}
    </table>`;
    default:
      return `<p style="color:${BODY};font-family:${FONT};font-size:15px;${TYPO.body};margin:0;">${s.bodyHtml}</p>`;
  }
}

export function darkGold(content: ThemeContent): string {
  const sectionsHtml = content.sections.map(renderSection).join('\n');
  const body = `
    <h2 style="color:${HEADING};font-family:${FONT};font-size:20px;${TYPO.heading};margin:0 0 4px;">${content.headline}</h2>
    <p style="color:${MUTED};font-family:${FONT};font-size:13px;margin:0 0 20px;">Fly &amp; Froth Weekly</p>
    <p style="color:${BODY};font-family:${FONT};font-size:15px;${TYPO.body};margin:0 0 24px;">${content.introHtml}</p>
    ${sectionsHtml}
    <p style="color:${BODY};font-family:${FONT};font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">${content.closingHtml}</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${ACCENT},${ACCENT_HOVER});color:${BG};text-decoration:none;${TYPO.cta};border-radius:6px;">${content.ctaLabel}</a>
    </div>`;

  return baseLayout({
    bgColor: BG, cardBg: CARD, accent: ACCENT, accentHover: ACCENT_HOVER,
    headingColor: HEADING, bodyColor: BODY, mutedColor: MUTED, borderColor: BORDER,
    ctaBg: `linear-gradient(135deg,${ACCENT},${ACCENT_HOVER})`, ctaText: BG,
    fontFamily: FONT, logoVariant: 'white', content: body,
  });
}
