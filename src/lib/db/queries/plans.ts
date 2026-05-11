import { db } from '@/lib/db';
import { contentPlans, contentSlots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ContentPlan, NewContentPlan, ContentSlot, NewContentSlot } from '@/types';

// ───── Plans ─────

export async function createPlan(data: NewContentPlan): Promise<ContentPlan> {
  const [created] = await db.insert(contentPlans).values(data).returning();
  if (!created) throw new Error('Failed to create plan');
  return created;
}

export async function getPlan(id: string): Promise<ContentPlan | null> {
  const rows = await db.select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPlanByWeek(calendarWeek: number, year: number): Promise<ContentPlan | null> {
  const rows = await db
    .select()
    .from(contentPlans)
    .where(and(eq(contentPlans.calendar_week, calendarWeek), eq(contentPlans.year, year)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePlan(id: string, patch: Partial<NewContentPlan>): Promise<ContentPlan> {
  const [updated] = await db.update(contentPlans).set(patch).where(eq(contentPlans.id, id)).returning();
  if (!updated) throw new Error(`Plan ${id} not found`);
  return updated;
}

export async function approvePlan(id: string): Promise<ContentPlan> {
  return updatePlan(id, { status: 'approved', approved_at: new Date() });
}

// ───── Slots ─────

export async function createSlot(data: NewContentSlot): Promise<ContentSlot> {
  const [created] = await db.insert(contentSlots).values(data).returning();
  if (!created) throw new Error('Failed to create slot');
  return created;
}

export async function createSlots(data: NewContentSlot[]): Promise<ContentSlot[]> {
  if (data.length === 0) return [];
  const created = await db.insert(contentSlots).values(data).returning();
  return created;
}

export async function getSlotsByPlan(planId: string): Promise<ContentSlot[]> {
  return db.select().from(contentSlots).where(eq(contentSlots.plan_id, planId));
}

export async function updateSlot(id: string, patch: Partial<NewContentSlot>): Promise<ContentSlot> {
  const [updated] = await db.update(contentSlots).set(patch).where(eq(contentSlots.id, id)).returning();
  if (!updated) throw new Error(`Slot ${id} not found`);
  return updated;
}

export async function deleteSlot(id: string): Promise<void> {
  await db.delete(contentSlots).where(eq(contentSlots.id, id));
}

export async function getSlot(id: string): Promise<ContentSlot | null> {
  const rows = await db.select().from(contentSlots).where(eq(contentSlots.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getApprovedSlotsForPublishing(): Promise<ContentSlot[]> {
  return db
    .select()
    .from(contentSlots)
    .where(and(eq(contentSlots.status, 'approved'), eq(contentSlots.channel, 'feed')));
}
