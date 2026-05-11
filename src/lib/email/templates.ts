import { getBrandKit } from '@/lib/db/queries/brand-kit';

// Base brand colors
const GOLD = '#d4a43a';
const DARK = '#050912';
const WHITE = '#fafafa';
const LIGHT_GOLD = '#f5e6c8';

function baseTemplate(content: string, year: number): string {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:${DARK};font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#0a0f1e;border-radius:12px;overflow:hidden;border:1px solid rgba(212,164,58,0.15);">

  <!-- Header -->
  <tr><td style="padding:36px 40px 20px;text-align:center;">
    <h1 style="color:${GOLD};font-size:26px;font-weight:700;margin:0;letter-spacing:1px;">FLY &amp; FROTH</h1>
    <p style="color:#8890a0;font-size:13px;margin:6px 0 0;">Grafik- &amp; Webdesign Studio — Karben, Rhein-Main</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${GOLD},transparent);"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:30px 40px;">
    ${content}
  </td></tr>

  <!-- CTA Divider -->
  <tr><td style="padding:10px 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,rgba(212,164,58,0.3),transparent);"></div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 40px 32px;text-align:center;">
    <p style="color:#8890a0;font-size:12px;margin:0 0 8px;">
      Fly &amp; Froth &middot; Röderweg 19 &middot; 61184 Karben<br>
      Tel: +49 163 1474127 &middot; info@fly-froth.com
    </p>
    <p style="color:#667080;font-size:11px;margin:0;">
      &copy; ${year} Fly &amp; Froth. Alle Rechte vorbehalten.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

// ── Portfolio Newsletter (weekly, tied to plan) ──

export interface PortfolioItem {
  headline: string;
  description: string;
  cta: string;
  serviceType: string;
}

export function portfolioNewsletter(
  items: PortfolioItem[],
  introText?: string,
  closingText?: string,
): string {
  const year = new Date().getFullYear();
  const cards = items
    .map(
      (item, i) => `
    <!-- Card ${i + 1} -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:${i < items.length - 1 ? '24px' : '0'};background-color:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(212,164,58,0.1);">
      <tr><td style="padding:20px 24px;">
        <span style="color:${GOLD};font-size:11px;text-transform:uppercase;letter-spacing:2px;">${item.serviceType}</span>
        <h2 style="color:${WHITE};font-size:18px;font-weight:600;margin:8px 0 6px;">${item.headline}</h2>
        <p style="color:#b0b8c4;font-size:14px;line-height:1.6;margin:0 0 12px;">${item.description}</p>
        <a href="https://fly-froth.com/kontakt" style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,${GOLD},#b8943a);color:${DARK};text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;letter-spacing:0.5px;">${item.cta}</a>
      </td></tr>
    </table>`,
    )
    .join('');

  const intro = introText ?? 'Neue Projekte aus unserem Studio — frisch aus der Kalenderwoche. Lass dich inspirieren und starte dein eigenes Projekt mit uns.';
  const closing = closingText ?? `Alle Angebote mit <strong style="color:${GOLD};">Express 24h</strong> verfügbar &middot; <a href="https://fly-froth.com" style="color:${GOLD};text-decoration:underline;">fly-froth.com</a>`;

  return baseTemplate(
    `
    <p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 24px;">${intro}</p>
    ${cards}
    <p style="color:#8890a0;font-size:13px;line-height:1.6;margin:24px 0 0;text-align:center;">${closing}</p>`,
    year,
  );
}

// ── Local Business Outreach ──

export interface LocalOutreachOpts {
  city: string;
  service: string;
  headline: string;
  usp: string;
}

export function localOutreachEmail(opts: LocalOutreachOpts): string {
  const year = new Date().getFullYear();
  return baseTemplate(
    `
    <h2 style="color:${WHITE};font-size:20px;font-weight:600;margin:0 0 8px;">${opts.headline}</h2>
    <p style="color:${GOLD};font-size:14px;margin:0 0 20px;">Dein Design-Studio in Karben — direkt um die Ecke in ${opts.city}</p>

    <p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 16px;">
      Wir sind Fly &amp; Froth, ein inhabergeführtes Design-Studio aus der Rhein-Main-Region. Über 850 Projekte, 5,0 Google-Bewertung, faire Preise.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="color:${GOLD};">&#10003;</span>
        <span style="color:#b0b8c4;font-size:14px;margin-left:8px;">${opts.usp}</span>
      </td></tr>
      <tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <span style="color:${GOLD};">&#10003;</span>
        <span style="color:#b0b8c4;font-size:14px;margin-left:8px;">Express-Lieferung in 24h möglich</span>
      </td></tr>
      <tr><td style="padding:12px 0;">
        <span style="color:${GOLD};">&#10003;</span>
        <span style="color:#b0b8c4;font-size:14px;margin-left:8px;">Persönlicher Ansprechpartner, WhatsApp-Kontakt</span>
      </td></tr>
    </table>

    <div style="text-align:center;margin:28px 0 8px;">
      <a href="https://fly-froth.com/kontakt" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${GOLD},#b8943a);color:${DARK};text-decoration:none;font-weight:700;font-size:14px;border-radius:6px;letter-spacing:0.5px;">Jetzt ${opts.service} anfragen</a>
    </div>

    <p style="color:#667080;font-size:12px;text-align:center;margin:16px 0 0;">
      Oder direkt WhatsApp: +49 163 1474127 &middot; Antwort innerhalb 12 Stunden, auch am Wochenende.
    </p>`,
    year,
  );
}

// ── Past Client Reactivation ──

export function reactivationEmail(clientName: string, lastProject: string): string {
  const year = new Date().getFullYear();
  return baseTemplate(
    `
    <p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 12px;">
      Hallo ${clientName},
    </p>
    <p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 20px;">
      dein letztes Projekt mit uns — <strong style="color:${GOLD};">${lastProject}</strong> — ist schon eine Weile her. Wir haben seitdem einiges weiterentwickelt und würden uns freuen, wieder von dir zu hören.
    </p>
    <p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 20px;">
      Ob ein neues Logo, ein Website-Relaunch oder frische Flyer — wir sind weiterhin für dich da, mit den gleichen fairen Preisen und der Express-Option.
    </p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="https://fly-froth.com/kontakt" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${GOLD},#b8943a);color:${DARK};text-decoration:none;font-weight:700;font-size:14px;border-radius:6px;letter-spacing:0.5px;">Neues Projekt starten</a>
    </div>
    <p style="color:#667080;font-size:12px;text-align:center;margin:16px 0 0;">
      Stammkunden erhalten 10% Rabatt auf das nächste Projekt. Einfach im Gespräch erwähnen!
    </p>`,
    year,
  );
}

// ── Weekly Digest (auto-generated from plan) ──

export interface DigestItem {
  topic: string;
  pillar: string;
  channel: string;
}

export function weeklyDigest(
  items: DigestItem[],
  week: number,
  year: number,
  introText?: string,
): string {
  const pillarLabels: Record<string, string> = {
    vitrine: 'Portfolio',
    prozess: 'Behind the Scenes',
    insight: 'Design-Wissen',
    lokal: 'Rhein-Main Lokal',
    reel: 'Video',
  };

  const sections: Record<string, DigestItem[]> = {};
  for (const item of items) {
    const key = item.pillar;
    if (!sections[key]) sections[key] = [];
    sections[key].push(item);
  }

  const sectionHtml = Object.entries(sections)
    .map(
      ([pillar, entries]) => `
    <h3 style="color:${GOLD};font-size:15px;font-weight:600;margin:20px 0 10px;text-transform:uppercase;letter-spacing:1px;">${pillarLabels[pillar] ?? pillar}</h3>
    ${entries
      .map(
        (e) => `
    <p style="color:#b0b8c4;font-size:14px;margin:0 0 6px;padding-left:12px;border-left:2px solid rgba(212,164,58,0.3);">
      ${e.channel === 'story' ? '📖' : e.channel === 'reel' ? '🎬' : '📱'} ${e.topic}
    </p>`,
      )
      .join('')}`,
    )
    .join('');

  const intro = introText
    ? `<p style="color:#b0b8c4;font-size:15px;line-height:1.7;margin:0 0 20px;">${introText}</p>`
    : '';

  return baseTemplate(
    `
    <h2 style="color:${WHITE};font-size:20px;font-weight:600;margin:0 0 4px;">Dein Weekly Digest</h2>
    <p style="color:#8890a0;font-size:13px;margin:0 0 20px;">Kalenderwoche ${week} — ${year}</p>
    ${intro}
    ${sectionHtml}
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="https://fly-froth.com" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${GOLD},#b8943a);color:${DARK};text-decoration:none;font-weight:700;font-size:14px;border-radius:6px;letter-spacing:0.5px;">Zur Website</a>
    </div>`,
    year,
  );
}
