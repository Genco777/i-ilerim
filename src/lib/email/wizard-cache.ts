import type { ThemeId } from './themes';

export interface PortfolioItemWizard {
  index: number;
  topic: string;
  pillar: string;
  headline: string;
  description: string;
  cta: string;
  serviceType: string;
  selected: boolean;
}

export interface WizardState {
  chatId: number;
  step: 'theme' | 'portfolio' | 'content' | 'send';
  campaignType: 'digest' | 'outreach' | 'reactivation';
  theme: ThemeId;
  // digest
  planId?: string;
  portfolioItems?: PortfolioItemWizard[];
  introText?: string;
  closingText?: string;
  subjectLine?: string;
  // outreach
  city?: string;
  service?: string;
  // reactivation
  recipientEmail?: string;
  clientName?: string;
  lastProject?: string;
}

const cache = new Map<number, WizardState>();
const timeouts = new Map<number, ReturnType<typeof setTimeout>>();

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getWizardState(chatId: number): WizardState | undefined {
  return cache.get(chatId);
}

export function setWizardState(chatId: number, state: WizardState): void {
  const existing = timeouts.get(chatId);
  if (existing) clearTimeout(existing);

  cache.set(chatId, state);

  timeouts.set(
    chatId,
    setTimeout(() => {
      cache.delete(chatId);
      timeouts.delete(chatId);
    }, TTL_MS),
  );
}

export function clearWizardState(chatId: number): void {
  cache.delete(chatId);
  const t = timeouts.get(chatId);
  if (t) clearTimeout(t);
  timeouts.delete(chatId);
}
