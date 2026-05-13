import { NextResponse } from 'next/server';
import {
  claimNextTask,
  completeTask,
  failTask,
  createTask,
  getTaskResult,
  setTaskRunning,
} from '@/lib/db/queries/agent-tasks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

// GET — local worker polls for next pending task
// POST — create new task (Vercel agent delegates to local)
// PATCH — update task status (complete/fail/running)
export async function GET(req: Request) {
  if (!checkAuth(req)) return new NextResponse('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const workerId = url.searchParams.get('worker') ?? 'local-worker';
  const taskId = url.searchParams.get('taskId');

  if (action === 'result' && taskId) {
    const result = await getTaskResult(taskId);
    return NextResponse.json(result);
  }

  // Default: claim next task
  const task = await claimNextTask(workerId);
  if (!task) {
    return NextResponse.json({ ok: true, task: null, message: 'No pending tasks' });
  }

  return NextResponse.json({ ok: true, task });
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json() as {
    task_type?: string;
    title?: string;
    payload?: Record<string, unknown>;
    priority?: number;
  };

  if (!body.task_type || !body.title) {
    return NextResponse.json({ ok: false, error: 'task_type and title required' }, { status: 400 });
  }

  const { id } = await createTask({
    task_type: body.task_type,
    title: body.title,
    payload: body.payload,
    priority: body.priority,
  });

  return NextResponse.json({ ok: true, taskId: id, message: `Task "${body.title}" created` });
}

export async function PATCH(req: Request) {
  if (!checkAuth(req)) return new NextResponse('Unauthorized', { status: 401 });

  const body = await req.json() as {
    taskId?: string;
    status?: 'completed' | 'failed' | 'running';
    result?: Record<string, unknown>;
    error?: string;
  };

  if (!body.taskId) {
    return NextResponse.json({ ok: false, error: 'taskId required' }, { status: 400 });
  }

  if (body.status === 'completed' && body.result) {
    await completeTask(body.taskId, body.result);
    return NextResponse.json({ ok: true, message: 'Task completed' });
  }

  if (body.status === 'failed') {
    await failTask(body.taskId, body.error ?? 'Unknown error');
    return NextResponse.json({ ok: true, message: 'Task failed' });
  }

  if (body.status === 'running') {
    await setTaskRunning(body.taskId);
    return NextResponse.json({ ok: true, message: 'Task running' });
  }

  return NextResponse.json({ ok: false, error: 'Invalid status' }, { status: 400 });
}
