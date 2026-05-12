// ── Theme registry + shared types ──

export interface SectionBlock {
  type: 'portfolio-card' | 'digest-item' | 'usp-list' | 'text';
  title?: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
}

export interface ThemeContent {
  headline: string;
  introHtml: string;
  sections: SectionBlock[];
  closingHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}

export type ThemeId = 'dark_steel' | 'light_steel' | 'dark_gold';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  dark_steel: {
    id: 'dark_steel',
    label: 'Koyu Çelik',
    description: 'Koyu navy arka plan, çelik mavisi vurgu — website dark mode birebir',
  },
  light_steel: {
    id: 'light_steel',
    label: 'Açık Çelik',
    description: 'Açık temiz arka plan, çelik mavisi vurgu — website light mode birebir',
  },
  dark_gold: {
    id: 'dark_gold',
    label: 'Koyu Altın',
    description: 'Koyu arka plan, altın vurgu — sıcak lüks hissiyat',
  },
};

export const DEFAULT_THEME: ThemeId = 'dark_steel';

// Will be populated after theme files are created (Tasks 3-5)
import { darkSteel } from './dark-steel';
import { lightSteel } from './light-steel';
import { darkGold } from './dark-gold';

export const THEME_FUNCTIONS: Record<ThemeId, (content: ThemeContent) => string> = {
  dark_steel: darkSteel,
  light_steel: lightSteel,
  dark_gold: darkGold,
};

export function renderTheme(themeId: ThemeId, content: ThemeContent): string {
  const fn = THEME_FUNCTIONS[themeId];
  if (!fn) throw new Error(`Unknown theme: ${themeId}`);
  return fn(content);
}
