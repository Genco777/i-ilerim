// ── Shared HTML layout wrapper for all email themes ──

export interface BaseOpts {
  bgColor: string;
  cardBg: string;
  accent: string;
  accentHover: string;
  headingColor: string;
  bodyColor: string;
  mutedColor: string;
  borderColor: string;
  ctaBg: string;
  ctaText: string;
  fontFamily: string;
  content: string;
}

function socialIcon(href: string, svg: string, accent: string): string {
  return `<a href="${href}" target="_blank" style="display:inline-block;width:36px;height:36px;background:${accent};border-radius:50%;text-align:center;line-height:34px;text-decoration:none;margin:0 6px;vertical-align:middle;">${svg}</a>`;
}

// Minimal brand mark SVG for Fly & Froth (stylized "FF" monogram)
// Used as logo fallback when no bitmap logo is available.
const LOGO_SVG = `<svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
  <rect x="2" y="2" width="40" height="40" rx="10" stroke="currentColor" stroke-width="2.5" fill="none"/>
  <text x="22" y="28" text-anchor="middle" fill="currentColor" font-family="Outfit,system-ui,sans-serif" font-weight="800" font-size="22" letter-spacing="-1">FF</text>
</svg>`;

const INSTAGRAM_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.5"/></svg>`;

const LINKEDIN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>`;

const GLOBE_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

const MAP_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-top:-1px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

export function baseLayout(opts: BaseOpts): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:${opts.bgColor};font-family:${opts.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${opts.bgColor};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:${opts.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${opts.borderColor};">

  <!-- Header with Logo -->
  <tr><td style="padding:36px 40px 24px;text-align:center;">
    <div style="color:${opts.accent};margin-bottom:10px;">
      ${LOGO_SVG}
    </div>
    <h1 style="color:${opts.accent};font-family:${opts.fontFamily};font-size:26px;font-weight:800;margin:0;letter-spacing:-0.5px;">FLY &amp; FROTH</h1>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;margin:6px 0 0;">Grafik- &amp; Webdesign Studio &middot; Karben, Rhein-Main</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}40,transparent);"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:30px 40px;">
    ${opts.content}
  </td></tr>

  <!-- USP Bar -->
  <tr><td style="padding:16px 40px 0;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);margin-bottom:16px;"></div>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">1000+</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Projekte</p>
        </td>
        <td width="12"></td>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">5.0</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Google ★</p>
        </td>
        <td width="12"></td>
        <td align="center" style="padding:12px 8px;background:${opts.bgColor};border-radius:8px;border:1px solid ${opts.borderColor};width:33%;">
          <p style="color:${opts.accent};font-family:${opts.fontFamily};font-size:20px;font-weight:800;margin:0;">24h</p>
          <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:2px 0 0;">Express</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:18px 40px 0;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);"></div>
  </td></tr>

  <!-- Social + Footer -->
  <tr><td style="padding:22px 40px 32px;text-align:center;">
    <table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 16px;">
      <tr>
        <td>${socialIcon('https://fly-froth.com', GLOBE_SVG, opts.accent)}</td>
        <td>${socialIcon('https://www.instagram.com/fly.froth', INSTAGRAM_SVG, opts.accent)}</td>
        <td>${socialIcon('https://www.linkedin.com/company/fly-froth', LINKEDIN_SVG, opts.accent)}</td>
        <td>${socialIcon('https://maps.google.com/?q=Fly+Froth+Karben', MAP_SVG, opts.accent)}</td>
      </tr>
    </table>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:12px;margin:0 0 4px;">
      Fly &amp; Froth &middot; R&ouml;derweg 19 &middot; 61184 Karben
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:0 0 8px;">
      <a href="https://fly-froth.com" style="color:${opts.accent};text-decoration:none;">fly-froth.com</a> &middot; <a href="mailto:info@fly-froth.com" style="color:${opts.accent};text-decoration:none;">info@fly-froth.com</a> &middot; Tel: +49 163 1474127
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:10px;margin:0;">
      &copy; ${year} Fly &amp; Froth. Alle Rechte vorbehalten.<br>
      <span style="font-size:9px;">Du erh&auml;ltst diese E-Mail, weil du dich f&uuml;r den Fly &amp; Froth Newsletter angemeldet hast.</span>
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

/** Typography defaults — all themes use these */
export const TYPO = {
  heading: 'font-weight:800;letter-spacing:-0.025em;',
  body: 'font-weight:300;line-height:1.7;',
  cta: 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;',
  eyebrow: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;',
};
