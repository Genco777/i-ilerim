/**
 * Real portfolio images from fly-froth.com — used for vitrine/prozess posts.
 * These are ACTUAL client work, not AI-generated.
 * Images are fetched from the live website at https://fly-froth.com/
 */

const SITE = 'https://fly-froth.com';

export interface PortfolioImage {
  url: string;
  service: string; // 'webdesign' | 'logodesign' | 'flyerdesign' | 'druckdesign' | 'branding'
  description: string; // German, used as alt/topic hint
}

export const LOGO_PORTFOLIO: PortfolioImage[] = [
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-grafik-mediver.webp`, service: 'logodesign', description: 'Logo Design für Mediver – Gesundheitsbranche' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-airdbase.webp`, service: 'logodesign', description: 'Logo Design für Airdbase – Technologie Startup' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-bearflor.webp`, service: 'logodesign', description: 'Logo Design für Bearflor – Handwerk & Bau' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-dsgvo.webp`, service: 'logodesign', description: 'Logo Design für DSGVO-Dienstleister' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-elective.webp`, service: 'logodesign', description: 'Logo Design für Elective – Bildung & Kurse' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-erfolgsroute.webp`, service: 'logodesign', description: 'Logo Design für Erfolgsroute – Business Coaching' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-famcare-1.webp`, service: 'logodesign', description: 'Logo Design für FamCare – Pflege & Gesundheit' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-firmenstart.webp`, service: 'logodesign', description: 'Logo Design für Firmenstart – Gründungsberatung' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-fsp.webp`, service: 'logodesign', description: 'Logo Design für FSP – Finanzdienstleistung' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-haarschnitt.webp`, service: 'logodesign', description: 'Logo Design für Haarschnitt – Friseur & Beauty' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-happyland.webp`, service: 'logodesign', description: 'Logo Design für Happyland – Kinder & Freizeit' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-hk.webp`, service: 'logodesign', description: 'Logo Design für HK – Handel & Logistik' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-jobcenter-spandau-1.webp`, service: 'logodesign', description: 'Logo Design für Jobcenter – Öffentlicher Dienst' },
  { url: `${SITE}/logos/logo-erstellen-lassen-radtke-ref-schaeffer.webp`, service: 'logodesign', description: 'Logo Design für Schäffer – Industrie & Produktion' },
];

export const FLYER_PORTFOLIO: PortfolioImage[] = [
  { url: `${SITE}/flyer-ref-event.webp`, service: 'flyerdesign', description: 'Flyerdesign für Event-Veranstalter' },
  { url: `${SITE}/flyer-ref-finanzen.webp`, service: 'flyerdesign', description: 'Flyerdesign für Finanzberatung' },
  { url: `${SITE}/flyer-ref-gastro.webp`, service: 'flyerdesign', description: 'Flyerdesign für Gastronomie & Restaurants' },
  { url: `${SITE}/flyer-ref-gesundheit.webp`, service: 'flyerdesign', description: 'Flyerdesign für Gesundheitswesen' },
  { url: `${SITE}/flyer-ref-immobilien.webp`, service: 'flyerdesign', description: 'Flyerdesign für Immobilienmakler' },
  { url: `${SITE}/flyer-ref-pflege.webp`, service: 'flyerdesign', description: 'Flyerdesign für Pflegedienste' },
];

export const DRUCK_PORTFOLIO: PortfolioImage[] = [
  { url: `${SITE}/druck-referenz/druck-ref-01.webp`, service: 'druckdesign', description: 'Druckdesign – Visitenkarten & Briefpapier' },
  { url: `${SITE}/druck-referenz/druck-ref-02.webp`, service: 'druckdesign', description: 'Druckdesign – Flyer & Broschüren' },
  { url: `${SITE}/druck-referenz/druck-ref-03.webp`, service: 'druckdesign', description: 'Druckdesign – Rollup Banner' },
  { url: `${SITE}/druck-referenz/druck-ref-04.webp`, service: 'druckdesign', description: 'Druckdesign – Speisekarten' },
  { url: `${SITE}/druck-referenz/druck-ref-05.webp`, service: 'druckdesign', description: 'Druckdesign – Schilder & Beschriftung' },
  { url: `${SITE}/druck-referenz/druck-ref-06.webp`, service: 'druckdesign', description: 'Druckdesign – Stempel & Siegel' },
  { url: `${SITE}/druck-referenz/druck-ref-07.webp`, service: 'druckdesign', description: 'Druckdesign – Textilien & Merch' },
  { url: `${SITE}/druck-referenz/druck-ref-08.webp`, service: 'druckdesign', description: 'Druckdesign – Aufkleber & Folien' },
  { url: `${SITE}/druck-referenz/druck-ref-09.webp`, service: 'druckdesign', description: 'Druckdesign – Kugelschreiber & Werbemittel' },
];

/** All real portfolio images combined */
export const ALL_PORTFOLIO: PortfolioImage[] = [
  ...LOGO_PORTFOLIO,
  ...FLYER_PORTFOLIO,
  ...DRUCK_PORTFOLIO,
];

/**
 * Pick a relevant portfolio image matching the topic text.
 * If no match found, returns a random portfolio image.
 */
export function pickPortfolioImage(topic: string, pillar?: string): PortfolioImage {
  const lowerTopic = topic.toLowerCase();

  // Try to match service type from topic
  if (pillar === 'vitrine' || lowerTopic.includes('logo') || lowerTopic.includes('firmen')) {
    const logos = LOGO_PORTFOLIO;
    // Try keyword match first
    for (const img of logos) {
      if (lowerTopic.includes(img.service) || img.description.toLowerCase().includes(lowerTopic.slice(0, 10))) {
        return img;
      }
    }
    return logos[Math.floor(Math.random() * logos.length)]!;
  }

  if (lowerTopic.includes('flyer') || lowerTopic.includes('broschüre') || lowerTopic.includes('prospekt')) {
    const flyers = FLYER_PORTFOLIO;
    return flyers[Math.floor(Math.random() * flyers.length)]!;
  }

  if (lowerTopic.includes('druck') || lowerTopic.includes('visitenkarte') || lowerTopic.includes('aufkleber') || lowerTopic.includes('schild')) {
    const druck = DRUCK_PORTFOLIO;
    return druck[Math.floor(Math.random() * druck.length)]!;
  }

  // Random from all
  return ALL_PORTFOLIO[Math.floor(Math.random() * ALL_PORTFOLIO.length)]!;
}
