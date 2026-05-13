import { db } from '@/lib/db';
import { agentMemories } from '@/lib/db/schema';
import { eq, desc, and, gte, ilike, sql } from 'drizzle-orm';

export interface AgentMemory {
  id: string;
  category: string;
  key: string;
  value: unknown;
  importance: number;
  lastAccessed: Date;
  accessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function remember(
  category: string,
  key: string,
  value: unknown,
  importance = 5,
): Promise<AgentMemory> {
  const [existing] = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.key, key))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(agentMemories)
      .set({
        value: value as never,
        importance,
        updated_at: new Date(),
      })
      .where(eq(agentMemories.id, existing.id))
      .returning();
    return mapMemory(updated!);
  }

  const [inserted] = await db
    .insert(agentMemories)
    .values({
      category,
      key,
      value: value as never,
      importance,
    })
    .returning();
  return mapMemory(inserted!);
}

export async function recall(key: string): Promise<AgentMemory | null> {
  const [mem] = await db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.key, key))
    .limit(1);

  if (!mem) return null;

  await db
    .update(agentMemories)
    .set({
      last_accessed: new Date(),
      access_count: mem.access_count + 1,
    })
    .where(eq(agentMemories.id, mem.id));

  return mapMemory(mem);
}

export async function searchMemories(query: string, category?: string): Promise<AgentMemory[]> {
  const conditions = [];

  if (category) {
    conditions.push(eq(agentMemories.category, category));
  }

  const searchTerm = `%${query}%`;
  conditions.push(
    sql`(${ilike(agentMemories.key, searchTerm)} OR ${ilike(agentMemories.category, searchTerm)})`,
  );

  const rows = await db
    .select()
    .from(agentMemories)
    .where(and(...conditions))
    .orderBy(desc(agentMemories.importance), desc(agentMemories.last_accessed))
    .limit(20);

  return rows.map(mapMemory);
}

export async function getImportantMemories(limit = 10): Promise<AgentMemory[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(agentMemories)
    .where(gte(agentMemories.importance, 5))
    .orderBy(desc(agentMemories.importance), desc(agentMemories.last_accessed))
    .limit(limit);

  return rows.map(mapMemory);
}

export async function forgetMemories(keyPattern: string): Promise<number> {
  const result = await db
    .delete(agentMemories)
    .where(ilike(agentMemories.key, `%${keyPattern}%`));
  return result.rowCount ?? 0;
}

export async function consolidateMemories(): Promise<number> {
  // Delete low-importance memories that haven't been accessed in 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(agentMemories)
    .where(
      and(
        sql`${agentMemories.importance} < 3`,
        sql`${agentMemories.last_accessed} < ${ninetyDaysAgo.toISOString()}`,
      ),
    );
  return result.rowCount ?? 0;
}

function mapMemory(m: typeof agentMemories.$inferSelect): AgentMemory {
  return {
    id: m.id,
    category: m.category,
    key: m.key,
    value: m.value,
    importance: m.importance,
    lastAccessed: m.last_accessed,
    accessCount: m.access_count,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  };
}
