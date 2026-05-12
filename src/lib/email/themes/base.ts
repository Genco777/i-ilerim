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

  <!-- Header -->
  <tr><td style="padding:36px 40px 20px;text-align:center;">
    <h1 style="color:${opts.accent};font-family:${opts.fontFamily};font-size:26px;font-weight:800;margin:0;letter-spacing:-0.5px;">FLY &amp; FROTH</h1>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;margin:8px 0 0;">Grafik- &amp; Webdesign Studio &middot; Karben, Rhein-Main</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}40,transparent);"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:30px 40px;">
    ${opts.content}
  </td></tr>

  <!-- CTA Divider -->
  <tr><td style="padding:10px 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);"></div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 40px 32px;text-align:center;">
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:12px;margin:0 0 8px;">
      Fly &amp; Froth &middot; R&ouml;derweg 19 &middot; 61184 Karben<br>
      Tel: +49 163 1474127 &middot; info@fly-froth.com
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:0;">
      &copy; ${year} Fly &amp; Froth. Alle Rechte vorbehalten.
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
