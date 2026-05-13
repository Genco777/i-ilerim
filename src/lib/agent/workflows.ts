import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface WorkflowStep {
  tool: string;
  purpose: string;
  input?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  triggers: string[];
  steps: WorkflowStep[];
}

export interface WorkflowRun {
  id: string;
  workflowName: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  currentStep: number;
  totalSteps: number;
  startedAt: Date;
  completedAt: Date | null;
  steps: WorkflowStepStatus[];
  context: Record<string, unknown>;
}

export interface WorkflowStepStatus {
  index: number;
  tool: string;
  purpose: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result: unknown;
  error?: string;
  completedAt: Date | null;
}

// ── Workflow Definitions ──

export const WORKFLOWS: Record<string, WorkflowDefinition> = {
  new_client_onboarding: {
    name: 'new_client_onboarding',
    description: 'Yeni müşteri karşılama: angebot oluştur, mail gönder, takip hatırlatıcısı kur',
    triggers: ['yeni müşteri', 'onboarding', 'karşılama', 'ilk teklif'],
    steps: [
      { tool: 'list_customers', purpose: 'Mükerrer müşteri kontrolü' },
      { tool: 'qualify_lead', purpose: 'Müşteri potansiyelini değerlendir' },
      { tool: 'get_business_profile', purpose: 'Hizmet ve fiyat bilgisi al' },
      { tool: 'send_mail', purpose: 'Hoşgeldin maili gönder' },
      { tool: 'create_task', purpose: '48 saat sonra takip görevi oluştur' },
    ],
  },

  invoice_collection: {
    name: 'invoice_collection',
    description: 'Ödenmemiş fatura takibi: hatırlatma zinciri başlat',
    triggers: ['ödeme', 'fatura takip', 'tahsilat', 'ödenmemiş'],
    steps: [
      { tool: 'list_invoices', purpose: 'Ödenmemiş faturaları tespit et' },
      { tool: 'get_invoice', purpose: 'Fatura detaylarını al' },
      { tool: 'send_mail', purpose: 'Ödeme hatırlatma maili gönder' },
      { tool: 'create_task', purpose: '7 gün sonra ikinci hatırlatma görevi' },
    ],
  },

  post_campaign: {
    name: 'post_campaign',
    description: 'Çok kanallı gönderi kampanyası: oluştur, yayınla, mail ile destekle',
    triggers: ['kampanya', 'tanıtım', 'promosyon', 'duyuru'],
    steps: [
      { tool: 'get_brand_kit', purpose: 'Marka bilgilerini al' },
      { tool: 'generate_post', purpose: 'Gönderi oluştur' },
      { tool: 'generate_image', purpose: 'Görsel oluştur' },
      { tool: 'publish_post', purpose: 'Gönderiyi yayınla' },
      { tool: 'send_mail', purpose: 'Email listesine duyuru gönder' },
    ],
  },

  lead_qualification: {
    name: 'lead_qualification',
    description: 'Gelen mesajı analiz et, lead puanla, uygunsa otomatik yanıtla',
    triggers: ['lead', 'potansiyel müşteri', 'soru', 'teklif iste'],
    steps: [
      { tool: 'qualify_lead', purpose: 'Lead sıcaklığını ölç' },
      { tool: 'get_business_profile', purpose: 'Hizmet bilgisi al' },
      { tool: 'get_portfolio', purpose: 'Referans işleri getir' },
      { tool: 'draft_social_reply', purpose: 'Yanıt taslağı oluştur' },
      { tool: 'create_task', purpose: 'Takip görevi oluştur' },
    ],
  },
};

// ── In-Memory Run Store ──

const runs = new Map<string, WorkflowRun>();

export function startWorkflow(
  workflowName: string,
  initialContext?: Record<string, unknown>,
): WorkflowRun {
  const def = WORKFLOWS[workflowName];
  if (!def) throw new Error(`Bilinmeyen workflow: ${workflowName}`);

  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    workflowName,
    status: 'running',
    currentStep: 0,
    totalSteps: def.steps.length,
    startedAt: new Date(),
    completedAt: null,
    steps: def.steps.map((s, i) => ({
      index: i,
      tool: s.tool,
      purpose: s.purpose,
      status: 'pending' as const,
      result: null,
      completedAt: null,
    })),
    context: initialContext ?? {},
  };

  runs.set(run.id, run);
  return run;
}

export function getWorkflowRun(id: string): WorkflowRun | undefined {
  return runs.get(id);
}

export function advanceWorkflow(
  runId: string,
  stepResult: unknown,
  error?: string,
): WorkflowRun | null {
  const run = runs.get(runId);
  if (!run || run.status !== 'running') return null;

  const step = run.steps[run.currentStep];
  if (!step) return null;

  step.status = error ? 'failed' : 'completed';
  step.result = stepResult;
  step.error = error;
  step.completedAt = new Date();

  if (error) {
    run.status = 'failed';
    run.completedAt = new Date();
    return run;
  }

  run.currentStep++;

  if (run.currentStep >= run.totalSteps) {
    run.status = 'completed';
    run.completedAt = new Date();
    return run;
  }

  const next = run.steps[run.currentStep];
  if (next) {
    next.status = 'running';
  }
  return run;
}

export function cancelWorkflow(runId: string): boolean {
  const run = runs.get(runId);
  if (!run || run.status !== 'running') return false;
  run.status = 'cancelled';
  run.completedAt = new Date();
  return true;
}

export function getCurrentStep(run: WorkflowRun): WorkflowStepStatus | null {
  return run.steps[run.currentStep] ?? null;
}

// ── Auto-Reply Intelligence ──

export async function qualifyLead(
  messageText: string,
  senderName?: string,
): Promise<{ score: 'hot' | 'warm' | 'cold'; reason: string; recommendedAction: string }> {
  const lower = messageText.toLowerCase();
  const hotKeywords = ['preis', 'angebot', 'kosten', 'auftrag', 'brauche', 'dringend', 'termin', 'sofort', 'heute'];
  const warmKeywords = ['interesse', 'info', 'portfolio', 'referenzen', 'fragen', 'welche', 'was kostet'];
  const coldKeywords = ['danke', 'ok', 'nein', 'spam'];

  let score: 'hot' | 'warm' | 'cold' = 'warm';
  let reason = 'Genel ilgi gösteriyor.';
  let recommendedAction = 'Bilgilendirici yanıt ver, portfolyo paylaş.';

  const hotMatches = hotKeywords.filter((k) => lower.includes(k));
  const warmMatches = warmKeywords.filter((k) => lower.includes(k));
  const coldMatches = coldKeywords.filter((k) => lower.includes(k));

  if (hotMatches.length >= 2 || lower.includes('dringend') || lower.includes('sofort')) {
    score = 'hot';
    reason = `Acil/alım sinyali: ${hotMatches.join(', ')}`;
    recommendedAction = 'Hemen fiyat ver, angebot oluşturmayı teklif et.';
  } else if (coldMatches.length >= 2) {
    score = 'cold';
    reason = `Düşük ilgi: ${coldMatches.join(', ')}`;
    recommendedAction = 'Kısa yanıt ver, kaynağı zorlama.';
  }

  return { score, reason, recommendedAction };
}

export async function createTask(
  description: string,
  deadline?: string,
  priority?: string,
): Promise<{ id: string; description: string; deadline: string | null; priority: string }> {
  const taskId = crypto.randomUUID();
  // In-memory task store for now — future: persist to DB
  const task = {
    id: taskId,
    description,
    deadline: deadline ?? null,
    priority: priority ?? 'medium',
  };

  // Store in global task Map (session-scoped)
  if (!(globalThis as Record<string, unknown>).__agent_tasks) {
    (globalThis as Record<string, unknown>).__agent_tasks = new Map<string, typeof task>();
  }
  const taskMap = (globalThis as Record<string, unknown>).__agent_tasks as Map<string, typeof task>;
  taskMap.set(taskId, task);

  return task;
}

export function getTask(taskId: string): { id: string; description: string; deadline: string | null; priority: string } | undefined {
  const taskMap = (globalThis as Record<string, unknown>).__agent_tasks as Map<string, unknown> | undefined;
  return taskMap?.get(taskId) as { id: string; description: string; deadline: string | null; priority: string } | undefined;
}

export function listTasks(): { id: string; description: string; deadline: string | null; priority: string }[] {
  const taskMap = (globalThis as Record<string, unknown>).__agent_tasks as Map<string, unknown> | undefined;
  if (!taskMap) return [];
  return Array.from(taskMap.values()) as { id: string; description: string; deadline: string | null; priority: string }[];
}
