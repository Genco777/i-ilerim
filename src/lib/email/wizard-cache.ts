import { db } from '@/lib/db';
import { wizardStates } from '@/lib/db/schema';
import { eq, lt } from 'drizzle-orm';
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

const TTL_MS = 30 * 60 * 1000; // 30 minutes

// In-memory fallback — keeps the bot alive when DB is unreachable
const memFallback = new Map<number, { state: WizardState; expiresAt: number }>();

function memGet(chatId: number): WizardState | undefined {
  const entry = memFallback.get(chatId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    memFallback.delete(chatId);
    return undefined;
  }
  return entry.state;
}

function memSet(chatId: number, state: WizardState): void {
  memFallback.set(chatId, { state, expiresAt: Date.now() + TTL_MS });
}

function memDelete(chatId: number): void {
  memFallback.delete(chatId);
}

export async function getWizardState(chatId: number): Promise<WizardState | undefined> {
  try {
    // Clean up expired rows on read
    await db.delete(wizardStates).where(lt(wizardStates.expiresAt, new Date()));

    const rows = await db
      .select()
      .from(wizardStates)
      .where(eq(wizardStates.chatId, chatId))
      .limit(1);

    if (rows.length === 0) return undefined;

    const row = rows[0]!;
    if (new Date(row.expiresAt) < new Date()) {
      await db.delete(wizardStates).where(eq(wizardStates.chatId, chatId));
      return undefined;
    }

    return row.state as unknown as WizardState;
  } catch (err) {
    console.error('getWizardState DB error, using memory fallback:', err);
    return memGet(chatId);
  }
}

export async function setWizardState(chatId: number, state: WizardState): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);

  try {
    await db
      .insert(wizardStates)
      .values({
        chatId,
        state: state as unknown as Record<string, unknown>,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: wizardStates.chatId,
        set: {
          state: state as unknown as Record<string, unknown>,
          expiresAt,
        },
      });
  } catch (err) {
    console.error('setWizardState DB error, using memory fallback:', err);
  }

  // Always update memory fallback so callbacks work even during DB outages
  memSet(chatId, state);
}

export async function clearWizardState(chatId: number): Promise<void> {
  try {
    await db.delete(wizardStates).where(eq(wizardStates.chatId, chatId));
  } catch (err) {
    console.error('clearWizardState DB error:', err);
  }
  memDelete(chatId);
}
