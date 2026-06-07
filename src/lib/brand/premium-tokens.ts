/**
 * Fly & Froth — Premium Brand Tokens
 *
 * Source-of-truth: `C:\Users\flyfr\yeni-site\premium-vizyon-projesi-main`
 * (editorial premium-vizyon stili — indigo accent, Outfit-tipo, eyebrow micro-typography)
 *
 * Bu sabitler hem procedural fallback (Sharp+SVG) hem de Canva brand template
 * autofill rengi/yazısı için kaynak görevi görür. Renkler HSL → HEX dönüştürülmüş;
 * gerçek runtime aynı palet.
 */

export type PillarKey = 'vitrine' | 'reel' | 'lokal' | 'edukatif' | 'sosyal';

export interface PremiumPalette {
  background: string;       // sayfa arka planı
  backgroundMuted: string;  // ikinci-katman muted bg
  foreground: string;       // ana metin (dark navy)
  mutedForeground: string;  // ikincil/eyebrow metin
  primary: string;          // accent / CTA
  primaryLight: string;     // hover / vurgu
  primaryHover: string;     // koyu hover
  card: string;             // kart yüzeyi
  border: string;           // ince border tonu
  shadowGlow: string;       // rgba glow
}

/** Light mode — premium-vizyon globals.css'ten birebir HEX karşılığı */
export const PALETTE_LIGHT: PremiumPalette = {
  background:       '#FCFCFC',     // hsl(0 0% 99%)
  backgroundMuted:  '#F2F4F8',     // hsl(220 20% 96%)
  foreground:       '#1D2233',     // hsl(228 25% 15%)
  mutedForeground:  '#6E7488',     // hsl(220 15% 48%)
  primary:          '#5B6BB0',     // hsl(228 34% 53%)  ← indigo accent
  primaryLight:     '#8C99CC',     // hsl(228 34% 68%)
  primaryHover:     '#475A99',     // hsl(228 34% 43%)
  card:             '#FFFFFF',     // hsl(0 0% 100%)
  border:           '#D8DCE5',     // hsl(220 15% 88%)
  shadowGlow:       'rgba(91, 107, 176, 0.30)',
};

/** Dark mode — opsiyonel kullanım (dark feed varyasyonu için) */
export const PALETTE_DARK: PremiumPalette = {
  background:       '#10131C',     // hsl(228 22% 8%)
  backgroundMuted:  '#171B27',     // hsl(228 22% 11%)
  foreground:       '#DDE0E9',     // hsl(220 15% 90%)
  mutedForeground:  '#7A8298',     // hsl(220 15% 55%)
  primary:          '#8C99CC',     // hsl(228 34% 65%)
  primaryLight:     '#A9B3D9',     // hsl(228 34% 75%)
  primaryHover:     '#9DA9D3',
  card:             '#171B27',
  border:           '#272E3F',
  shadowGlow:       'rgba(140, 153, 204, 0.45)',
};

/**
 * Pillar bazlı ufak vurgu — her içerik direği için ufak palet kayması.
 * Ana renk hep premium-vizyon indigo (#5B6BB0), accent ton değişir.
 */
export const PILLAR_ACCENT: Record<PillarKey, string> = {
  vitrine:  '#5B6BB0',   // ana indigo
  reel:     '#8C99CC',   // primary-light — daha hafif/dinamik
  lokal:    '#475A99',   // primary-hover — koyu/güven
  edukatif: '#6E7488',   // muted-foreground — bilgilendirici, sade
  sosyal:   '#5B6BB0',   // ana indigo
};

/** Tipografi sabitleri (SVG `font-family` için fallback'li stack) */
export const FONT_STACK = {
  display: "'Outfit','Inter','Helvetica Neue',Arial,sans-serif",
  body:    "'Outfit','Inter','Helvetica Neue',Arial,sans-serif",
  mono:    "'JetBrains Mono','SF Mono',Consolas,monospace",
};

/** Editorial layout sabitleri (1080×1350 IG portrait için optimize) */
export const LAYOUT = {
  /** outer safe-padding (Sharp/SVG için px) */
  pad: 80,
  /** eyebrow → başlık arası */
  gapEyebrowTitle: 32,
  /** başlık → gövde arası */
  gapTitleBody: 40,
  /** alt brand-mark hizalama mesafesi */
  bottomBrandOffset: 64,
  /** köşe yarıçapı (subtle, premium-vizyon radius=0.5rem ≈ 12px @ 1080px) */
  radius: 12,
};

/** Brand markası (alt köşede görünecek imza metni) */
export const BRAND_MARK = {
  name:    'Fly & Froth',
  tagline: 'Design Studio · Karben',
};
