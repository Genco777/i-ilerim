import { db } from '@/lib/db';
import { wizardStates } from '@/lib/db/schema';
import { eq, and, lt } from 'drizzle-orm';
import type { ThemeId } from './themes';

export interface CampaignConcept {
  title: string;
  angle: string;
  subjectLine: string;
  introText: string;
  closingText: string;
  portfolioFocus: string[];
}

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
  step: 'concept' | 'theme' | 'portfolio' | 'content' | 'send';
  campaignType: 'digest' | 'outreach' | 'reactivation';
  theme: ThemeId;
  // concept generation
  concepts?: CampaignConcept[];
  selectedConceptIndex?: number;
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

const TTL_MS = 30 * 60 * 1000;

function isExpired(row: { expiresAt: Date }): boolean {
  return new Date(row.expiresAt) < new Date();
}

export async function getWizardState(chatId: number): Promise<WizardState | undefined> {
  try {
    const [row] = await db
      .select()
      .from(wizardStates)
      .where(eq(wizardStates.chatId, chatId))
      .limit(1);
    if (!row || isExpired(row)) {
      if (row) await clearWizardState(chatId).catch(() => {});
      return undefined;
    }
    return row.state as WizardState;
  } catch {
    return undefined;
  }
}

export async function setWizardState(chatId: number, state: WizardState): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db
    .insert(wizardStates)
    .values({
      chatId,
      state: state as unknown as Record<string, unknown>,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: wizardStates.chatId,
      set: { state: state as unknown as Record<string, unknown>, expiresAt },
    });
}

export async function clearWizardState(chatId: number): Promise<void> {
  try {
    await db.delete(wizardStates).where(eq(wizardStates.chatId, chatId));
  } catch { /* table might not exist yet */ }
}

// Clean up expired states (call periodically)
export async function cleanupExpiredStates(): Promise<void> {
  try {
    await db
      .delete(wizardStates)
      .where(lt(wizardStates.expiresAt, new Date()));
  } catch { /* ok */ }
}
