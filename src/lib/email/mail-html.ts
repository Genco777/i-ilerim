import { baseLayout, TYPO } from './themes/base';

const BG = '#FCFCFD';
const CARD = '#FFFFFF';
const ACCENT = '#8A9DC8';
const ACCENT_HOVER = '#6A82B8';
const HEADING = '#1A2340';
const BODY = '#4A5568';
const MUTED = '#7A8BA8';
const BORDER = '#C8D4E8';
const FONT = 'Outfit, system-ui, sans-serif';

export function wrapMailHtml(opts: {
  subject: string;
  bodyText: string;
}): string {
  const paragraphs = opts.bodyText
    .split('\n')
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="color:${BODY};font-family:${FONT};font-size:15px;${TYPO.body};margin:0 0 12px;">${p}</p>`,
    )
    .join('\n');

  const content = `
    <h2 style="color:${HEADING};font-family:${FONT};font-size:20px;${TYPO.heading};margin:0 0 4px;">${opts.subject}</h2>
    <p style="color:${MUTED};font-family:${FONT};font-size:13px;margin:0 0 20px;">Fly &amp; Froth &middot; Grafik- &amp; Webdesign</p>
    ${paragraphs}
    <p style="color:${BODY};font-family:${FONT};font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">
      Bei Fragen einfach antworten &mdash; pers&ouml;nlicher Support garantiert.
    </p>`;

  return baseLayout({
    bgColor: BG,
    cardBg: CARD,
    accent: ACCENT,
    accentHover: ACCENT_HOVER,
    headingColor: HEADING,
    bodyColor: BODY,
    mutedColor: MUTED,
    borderColor: BORDER,
    ctaBg: ACCENT,
    ctaText: '#FFFFFF',
    fontFamily: FONT,
    logoVariant: 'navy',
    content,
  });
}
