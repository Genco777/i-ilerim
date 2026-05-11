/**
 * Real portfolio images from fly-froth.com — used for vitrine/prozess posts.
 * These are ACTUAL client work, not AI-generated.
 * Images are stored locally in public/portfolio/ for guaranteed availability.
 */

export interface PortfolioImage {
  path: string; // local public path, e.g. '/portfolio/logos/mediver.webp'
  service: 'webdesign' | 'logodesign' | 'flyerdesign' | 'druckdesign' | 'branding';
  keywords: string[]; // German keywords for topic matching
  description: string;
}

// ── Logo Design Portfolio (23 client logos) ──

const LOGO_FILES = [
  'logo-erstellen-lassen-radtke-grafik-mediver',
  'logo-erstellen-lassen-radtke-ref-airdbase',
  'logo-erstellen-lassen-radtke-ref-bearflor',
  'logo-erstellen-lassen-radtke-ref-dsgvo',
  'logo-erstellen-lassen-radtke-ref-elective',
  'logo-erstellen-lassen-radtke-ref-erfolgsroute',
  'logo-erstellen-lassen-radtke-ref-famcare-1',
  'logo-erstellen-lassen-radtke-ref-firmenstart',
  'logo-erstellen-lassen-radtke-ref-fsp',
  'logo-erstellen-lassen-radtke-ref-haarschnitt',
  'logo-erstellen-lassen-radtke-ref-happyland',
  'logo-erstellen-lassen-radtke-ref-hk',
  'logo-erstellen-lassen-radtke-ref-jobcenter-spandau-1',
  'logo-erstellen-lassen-radtke-ref-schaeffer',
  'logo-erstellen-lassen-radtke-ref-schindele',
  'logo-erstellen-lassen-radtke-ref-sheldon',
  'logo-erstellen-lassen-radtke-ref-studienabbruch',
  'logo-erstellen-lassen-radtke-ref-tandem',
  'logo-erstellen-lassen-radtke-ref-topphysio-1',
  'logo-erstellen-lassen-radtke-ref-vemango',
  'logo-erstellen-lassen-radtke-ref-vivakon',
  'logo-erstellen-lassen-radtke-ref-wfb-1',
  'logo-erstellen-lassen-radtke-ref-wildlifepro',
  'logo-erstellen-lassen-radtke-ref-wolff',
];

const LOGO_DESCRIPTIONS: Record<string, string> = {
  mediver: 'Logo Design für Mediver – Gesundheitsbranche',
  airdbase: 'Logo Design für Airdbase – Technologie Startup',
  bearflor: 'Logo Design für Bearflor – Handwerk & Bau',
  dsgvo: 'Logo Design für DSGVO-Dienstleister',
  elective: 'Logo Design für Elective – Bildung & Kurse',
  erfolgsroute: 'Logo Design für Erfolgsroute – Business Coaching',
  'famcare-1': 'Logo Design für FamCare – Pflege & Gesundheit',
  firmenstart: 'Logo Design für Firmenstart – Gründungsberatung',
  fsp: 'Logo Design für FSP – Finanzdienstleistung',
  haarschnitt: 'Logo Design für Haarschnitt – Friseur & Beauty',
  happyland: 'Logo Design für Happyland – Kinder & Freizeit',
  hk: 'Logo Design für HK – Handel & Logistik',
  'jobcenter-spandau-1': 'Logo Design für Jobcenter – Öffentlicher Dienst',
  schaeffer: 'Logo Design für Schäffer – Industrie & Produktion',
  schindele: 'Logo Design für Schindele – Handwerk',
  sheldon: 'Logo Design für Sheldon – Dienstleistung',
  studienabbruch: 'Logo Design für Studienabbruch – Bildung',
  tandem: 'Logo Design für Tandem – Soziales',
  'topphysio-1': 'Logo Design für Topphysio – Physiotherapie',
  vemango: 'Logo Design für Vemango – Software',
  vivakon: 'Logo Design für Vivakon – Beratung',
  'wfb-1': 'Logo Design für WFB – Bildungswerk',
  wildlifepro: 'Logo Design für WildlifePro – Naturschutz',
  wolff: 'Logo Design für Wolff – Industrie',
};

function buildLogoPortfolio(): PortfolioImage[] {
  return LOGO_FILES.map((file) => {
    const key = file.replace('logo-erstellen-lassen-radtke-grafik-', '').replace('logo-erstellen-lassen-radtke-ref-', '');
    return {
      path: `/portfolio/logos/${file}.webp`,
      service: 'logodesign' as const,
      keywords: [key, 'logo', 'logodesign', 'firmenlogo', 'branding'],
      description: LOGO_DESCRIPTIONS[key] ?? `Logo Design Referenz – ${key}`,
    };
  });
}

// ── Druck/Print Portfolio ──

const DRUCK_REFERENCE: { file: string; label: string }[] = [
  { file: 'druck-ref-01', label: 'Visitenkarten & Briefpapier' },
  { file: 'druck-ref-02', label: 'Flyer & Broschüren' },
  { file: 'druck-ref-03', label: 'Rollup Banner' },
  { file: 'druck-ref-04', label: 'Speisekarten' },
  { file: 'druck-ref-05', label: 'Schilder & Beschriftung' },
  { file: 'druck-ref-06', label: 'Stempel & Siegel' },
  { file: 'druck-ref-07', label: 'Textilien & Merch' },
  { file: 'druck-ref-08', label: 'Aufkleber & Folien' },
  { file: 'druck-ref-09', label: 'Kugelschreiber & Werbemittel' },
];

const DRUCK_PRODUCTS: { file: string; label: string }[] = [
  { file: 'druck-visitenkarten', label: 'Visitenkarten Design' },
  { file: 'druck-flyer', label: 'Flyer Druck' },
  { file: 'druck-rollup', label: 'Rollup Banner Druck' },
  { file: 'druck-schilder', label: 'Schilder & Beschriftung' },
  { file: 'druck-stempel', label: 'Stempel Druck' },
  { file: 'druck-textilien', label: 'Textilien Druck' },
  { file: 'druck-uv', label: 'UV Druck' },
  { file: 'druck-folien', label: 'Folien Druck' },
  { file: 'druck-kugelschreiber', label: 'Kugelschreiber Werbemittel' },
  { file: 'druck-menuekarten', label: 'Menükarten Design' },
  { file: 'druck-papiertaschen', label: 'Papiertaschen Druck' },
  { file: 'visitenkartendesign-hero', label: 'Visitenkarten Design Studio' },
  { file: 'visitenkarte-referenz-1', label: 'Visitenkarten Referenz 1' },
  { file: 'visitenkarte-referenz-2', label: 'Visitenkarten Referenz 2' },
  { file: 'visitenkarte-referenz-3', label: 'Visitenkarten Referenz 3' },
];

function buildDruckPortfolio(): PortfolioImage[] {
  return [
    ...DRUCK_REFERENCE.map((d) => ({
      path: `/portfolio/druck/${d.file}.webp`,
      service: 'druckdesign' as const,
      keywords: [d.file, 'druck', 'print', d.label.toLowerCase(), 'visitenkarte', 'flyer', 'broschüre', 'aufkleber', 'stempel', 'schild'],
      description: `Druckdesign – ${d.label}`,
    })),
    ...DRUCK_PRODUCTS.map((d) => ({
      path: `/portfolio/druck/${d.file}.webp`,
      service: 'druckdesign' as const,
      keywords: [d.file, 'druck', 'print', d.label.toLowerCase()],
      description: d.label,
    })),
  ];
}

// ── Flyer Portfolio ──

const FLYER_FILES = [
  { file: 'flyer-ref-event', label: 'Event Flyer' },
  { file: 'flyer-ref-finanzen', label: 'Finanzberatung Flyer' },
  { file: 'flyer-ref-gastro', label: 'Gastronomie Flyer' },
  { file: 'flyer-ref-gesundheit', label: 'Gesundheitswesen Flyer' },
  { file: 'flyer-ref-immobilien', label: 'Immobilien Flyer' },
  { file: 'flyer-ref-pflege', label: 'Pflegedienste Flyer' },
  { file: 'flyerdesign-hero', label: 'Flyer Design Hero' },
  { file: 'uniqat-immobilien-flyer', label: 'Uniqat Immobilien Flyer' },
];

function buildFlyerPortfolio(): PortfolioImage[] {
  return FLYER_FILES.map((f) => ({
    path: `/portfolio/flyer/${f.file}.webp`,
    service: 'flyerdesign' as const,
    keywords: [f.file, 'flyer', 'flyerdesign', 'broschüre', 'prospekt', 'handzettel'],
    description: `Flyerdesign – ${f.label}`,
  }));
}

// ── Webdesign Portfolio ──

const WEBDESIGN_FILES = [
  { file: 'laptop-screen', label: 'Website auf Laptop' },
  { file: 'webdesign-hero', label: 'Webdesign Hero' },
];

function buildWebdesignPortfolio(): PortfolioImage[] {
  return WEBDESIGN_FILES.map((f) => ({
    path: `/portfolio/webdesign/${f.file}.webp`,
    service: 'webdesign' as const,
    keywords: ['webdesign', 'website', 'homepage', 'webseite', f.file],
    description: `Webdesign – ${f.label}`,
  }));
}

// ── Project Screenshots ──

const PROJECT_FILES = [
  'ba98f7_0dbdd707ec0047bab5f279ccd51911cb~mv2',
  'ba98f7_12f45c4b551446a191af5323c152ff97~mv2',
  'ba98f7_136e77f826354ba2baba1d06ccf887c9~mv2',
  'ba98f7_2b6acca7fdca44c19724297397a78a3b~mv2',
  'ba98f7_3565bea3c3ed48eea6bb61d2c271c4e1~mv2',
  'ba98f7_4b03e992b5d344a7b19e825ec0064375~mv2',
  'ba98f7_70f71923d1a04089b06c7c85b383161c~mv2',
  'ba98f7_878324e020cd471188dfd8c165e58e96~mv2',
  'ba98f7_b65e8835ccf3480592668f0a7bf30f2e~mv2',
  'ba98f7_b751976cd0184b6087e369e148adcd09~mv2',
  'ba98f7_c654d6af2f5e4a3bb8c166584cb816cb~mv2',
  'ba98f7_dadb25e3d2144c36b9bc3dd0a2ea902b~mv2',
  'ba98f7_df230dca65d1432fbde95ca77dd6c09c~mv2',
  'ba98f7_e4973bfcf7ae4a38a08af1a9a89ee25a~mv2',
  'ba98f7_f693dce7b1e2460b98f6f832caabf630~mv2',
];

function buildProjectPortfolio(): PortfolioImage[] {
  return PROJECT_FILES.map((file) => ({
    path: `/portfolio/projeler/${file}.jpg`,
    service: 'webdesign' as const,
    keywords: ['webdesign', 'website', 'proje', 'projekt', 'kunde', 'referenz'],
    description: 'Website Projekt – Live-Umsetzung',
  }));
}

// ── Combined ──

const LOGO_PORTFOLIO = buildLogoPortfolio();
const DRUCK_PORTFOLIO = buildDruckPortfolio();
const FLYER_PORTFOLIO = buildFlyerPortfolio();
const WEBDESIGN_PORTFOLIO = buildWebdesignPortfolio();
const PROJECT_PORTFOLIO = buildProjectPortfolio();

export const ALL_PORTFOLIO: PortfolioImage[] = [
  ...LOGO_PORTFOLIO,
  ...DRUCK_PORTFOLIO,
  ...FLYER_PORTFOLIO,
  ...WEBDESIGN_PORTFOLIO,
  ...PROJECT_PORTFOLIO,
];

/**
 * Score how well a portfolio image matches a topic string.
 * Returns 0-100, higher = better match.
 */
function matchScore(img: PortfolioImage, topicLower: string): number {
  let score = 0;
  for (const kw of img.keywords) {
    if (topicLower.includes(kw)) {
      score += kw.length >= 5 ? 30 : 15; // longer keyword match = stronger signal
    }
  }
  // Bonus for service match
  if (topicLower.includes(img.service)) score += 20;
  // Bonus for description word overlap
  const descWords = img.description.toLowerCase().split(/\s+/);
  const topicWords = topicLower.split(/\s+/);
  for (const dw of descWords) {
    if (dw.length >= 4 && topicWords.some((tw) => tw.includes(dw) || dw.includes(tw))) {
      score += 5;
    }
  }
  return Math.min(score, 100);
}

/**
 * Pick the best matching portfolio image for a topic.
 * Scores all images in the pool, then deterministically picks from the
 * top candidates using the topic hash so similar topics get different images.
 */
export function pickPortfolioImage(topic: string, pillar?: string): PortfolioImage {
  const lowerTopic = topic.toLowerCase();

  // Pick candidate pool based on topic keywords
  let pool = ALL_PORTFOLIO;

  if (lowerTopic.includes('logo') || lowerTopic.includes('firmenlogo') || lowerTopic.includes('branding') || lowerTopic.includes('marke')) {
    pool = LOGO_PORTFOLIO;
  } else if (lowerTopic.includes('flyer') || lowerTopic.includes('broschüre') || lowerTopic.includes('prospekt') || lowerTopic.includes('handzettel')) {
    pool = FLYER_PORTFOLIO;
  } else if (lowerTopic.includes('druck') || lowerTopic.includes('visitenkarte') || lowerTopic.includes('aufkleber') || lowerTopic.includes('stempel') || lowerTopic.includes('schild') || lowerTopic.includes('textil')) {
    pool = DRUCK_PORTFOLIO;
  } else if (lowerTopic.includes('web') || lowerTopic.includes('homepage') || lowerTopic.includes('website') || lowerTopic.includes('seite')) {
    pool = [...WEBDESIGN_PORTFOLIO, ...PROJECT_PORTFOLIO];
  }

  // Hash the topic for deterministic variety (combine with pillar for extra spread)
  function topicHash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Score all images, sort by score descending
  const scored = pool.map((img) => ({ img, score: matchScore(img, lowerTopic) }));
  scored.sort((a, b) => b.score - a.score);

  // When top scores are close together (common with broad topics), pick from a
  // wide band so different slots get different images. Tight scoring means the
  // topic keywords didn't distinguish well, so we lean harder on the hash.
  const topScore = scored[0]!.score;
  const band = topScore <= 30 ? pool.length // no strong match → whole pool
    : topScore <= 50 ? Math.max(topScore - 5, 1) // moderate match → tight band
    : Math.max(topScore - 15, 1); // strong match → wider band for variety
  const candidates = scored.filter((s) => s.score >= band || s.score >= topScore - 3);

  const idx = topicHash(topic) % candidates.length;
  return candidates[idx]!.img;
}
