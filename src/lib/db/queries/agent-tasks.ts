import { db } from '@/lib/db';
import { agentTasks } from '@/lib/db/schema';
import { eq, desc, asc, and, lt } from 'drizzle-orm';

export interface PendingTask {
  id: string;
  task_type: string;
  title: string;
  payload: Record<string, unknown>;
  priority: number;
  created_at: Date;
}

export async function createTask(params: {
  task_type: string;
  title: string;
  payload?: Record<string, unknown>;
  priority?: number;
}): Promise<{ id: string }> {
  const rows = await db.insert(agentTasks).values({
    task_type: params.task_type,
    title: params.title,
    payload: params.payload ?? {},
    priority: params.priority ?? 5,
  }).returning({ id: agentTasks.id });

  if (!rows[0]) throw new Error('Failed to create task');
  return { id: rows[0].id };
}

export async function claimNextTask(workerId: string): Promise<PendingTask | null> {
  const pending = await db
    .select()
    .from(agentTasks)
    .where(eq(agentTasks.status, 'pending'))
    .orderBy(desc(agentTasks.priority), asc(agentTasks.created_at))
    .limit(1);

  if (!pending.length || !pending[0]) return null;

  const task = pending[0];
  await db
    .update(agentTasks)
    .set({ status: 'claimed', claimed_by: workerId, claimed_at: new Date() })
    .where(eq(agentTasks.id, task.id));

  return {
    id: task.id,
    task_type: task.task_type,
    title: task.title,
    payload: task.payload as Record<string, unknown>,
    priority: task.priority ?? 5,
    created_at: task.created_at,
  };
}

export async function completeTask(taskId: string, result: Record<string, unknown>): Promise<void> {
  await db
    .update(agentTasks)
    .set({ status: 'completed', result, completed_at: new Date() })
    .where(eq(agentTasks.id, taskId));
}

export async function failTask(taskId: string, error: string): Promise<void> {
  await db
    .update(agentTasks)
    .set({ status: 'failed', error, completed_at: new Date() })
    .where(eq(agentTasks.id, taskId));
}

export async function getTaskResult(taskId: string): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({ status: agentTasks.status, result: agentTasks.result, error: agentTasks.error })
    .from(agentTasks)
    .where(eq(agentTasks.id, taskId))
    .limit(1);

  if (!rows.length || !rows[0]) return null;
  return { status: rows[0].status, result: rows[0].result, error: rows[0].error };
}

export async function setTaskRunning(taskId: string): Promise<void> {
  await db
    .update(agentTasks)
    .set({ status: 'running' })
    .where(eq(agentTasks.id, taskId));
}

// Clean up old completed/failed tasks (keep last 7 days)
export async function cleanupOldTasks(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(agentTasks)
    .where(
      and(
        eq(agentTasks.status, 'completed'),
        lt(agentTasks.completed_at, cutoff),
      ),
    )
    .returning({ id: agentTasks.id });
  return result.length;
}

// Poll for task completion (wait up to timeoutMs)
export async function waitForTask(
  taskId: string,
  timeoutMs = 120000,
  pollMs = 2000,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await getTaskResult(taskId);
    if (result && (result.status === 'completed' || result.status === 'failed')) {
      return result;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { status: 'timeout', error: 'Task did not complete within timeout' };
}
