import Anthropic from '@anthropic-ai/sdk';
import { sendMessage, editMessageText } from '@/lib/telegram/bot';
import { AGENT_TOOLS, executeTool } from './tools';
import type {
  MessageParam,
  ToolUseBlock,
} from './types';
import { MAX_TOOL_TURNS, MAX_CONTEXT_MESSAGES, THROTTLE_EDIT_MS } from './types';
import { runSwarmTurn } from './swarm';
import { buildMemoryContext, extractAndStoreMemories } from './memory';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// In-memory sessions (lost on restart, but DB has message history)
const sessions = new Map<number, { conversationId: string; messages: MessageParam[] }>();

// Serialization lock: prevent back-to-back messages from racing on the same session
const turnLocks = new Map<number, Promise<void>>();

function getOrCreateSession(chatId: number): {
  conversationId: string;
  messages: MessageParam[];
} {
  let session = sessions.get(chatId);
  if (!session) {
    session = {
      conversationId: `conv_${chatId}_${Date.now()}`,
      messages: [],
    };
    sessions.set(chatId, session);
  }
  return session;
}

// System prompt cache — 5 dk TTL
let cachedSystemPrompt: { text: string; until: number } | null = null;

export function bustSystemPromptCache(): void {
  cachedSystemPrompt = null;
}

async function getExtraInstructions(): Promise<string> {
  try {
    const { getSystemConfigValue } = await import('@/lib/db/queries/system-config');
    const extra = await getSystemConfigValue('agent_system_prompt_extra', '');
    return extra || '(Henuz ozel talimat eklenmemis.)';
  } catch {
    return '(Ozel talimatlar yuklenemedi.)';
  }
}

async function getConfigNumber(key: string, fallback: number): Promise<number> {
  try {
    const { getSystemConfigValue } = await import('@/lib/db/queries/system-config');
    const val = await getSystemConfigValue(key, String(fallback));
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

async function getConfigBool(key: string, fallback: boolean): Promise<boolean> {
  try {
    const { getSystemConfigValue } = await import('@/lib/db/queries/system-config');
    const val = await getSystemConfigValue(key, fallback ? 'true' : 'false');
    return val === 'true';
  } catch {
    return fallback;
  }
}

async function buildSystemPrompt(): Promise<string> {
  const now = Date.now();
  if (cachedSystemPrompt && now < cachedSystemPrompt.until) return cachedSystemPrompt.text;

  let businessProfile = '';
  try {
    const { loadMergedProfile } = await import('@/lib/kleinanzeigen/profile');
    businessProfile = await loadMergedProfile();
  } catch {
    businessProfile = 'Fly & Froth — Grafik- & Webdesign Studio, Karben (Hessen).';
  }

  const text = `Du bist der AI-Assistent von Fly & Froth (fly-froth.com), einem Grafik- und Webdesign-Studio in Karben (Hessen, Deutschland).

Inhaber: Mehmet Genco.
Sprache: Deutsch. Wenn Mehmet Turkisch schreibt, antworte auf Turkisch.

DEINE ROLLE:
- Business-Partner: Du kennst ALLE Projekte, Kunden, Ablaufe
- Executor: Du TUST Dinge eigenstandig mit deinen Tools — nicht nur beschreiben
- Mentor: Strategische Beratung fur Unternehmenswachstum
- Designer: Du kannst Flyer, Logos, Grafiken entwerfen (generate_image, generate_svg)
- Kommunikator: Du hilfst bei Kundenkommunikation (Email, Kleinanzeigen, Social Media)

ZIEL:
Mehmet will 40.000+ monatlichen Umsatz erreichen. Jede Aktion und Empfehlung darauf ausrichten.
Hilf ihm durch: bessere Kundenkommunikation, mehr Sichtbarkeit, intelligentere Automatisierung, schnellere Abwicklung.

BUSINESS-KONTEXT (live von fly-froth.com):
${businessProfile}

HAFIZA (son 7 gunde ogrenilen onemli bilgiler):
${await buildMemoryContext()}

OZEL TALIMATLAR (Mehmet'in ekledigi canli yonergeler):
${await getExtraInstructions()}

KRITISCHE REGELN:
1. Wenn Mehmet dich bittet etwas zu tun (z.B. "erstell eine Rechnung", "schick eine Mail", "check die inbox"), dann TUE ES SOFORT mit den verfugbaren Tools. Frage NICHT ob du es tun sollst.
2. Wenn du unsicher bist, frage KURZ nach (max 1 Satz), dann handle.
3. Nach Tool-Ausfuhrung: fasse ERGEBNISSE zusammen, nicht den Prozess.
4. Keine langen Erklarungen was du tun KONNTEST — tu es einfach.
5. Wenn ein Tool fehlschlagt, erklare warum und biete Alternative.

DEIN STIL:
- Professionell, direkt, unternehmerisch
- Kurz und prazise — kein Geschwafel
- Max 1-2 Emojis pro Antwort
- Bullet Points fur Listen, nicht Fliesstext fur alles

KONTAKTDATEN:
- Web: fly-froth.com
- Email: info@fly-froth.com
- Tel: +49 163 1474127
- Adresse: Roderweg 19, 61184 Karben
- Facebook: facebook.com/fly.froth
- Instagram: instagram.com/fly.froth
- WhatsApp: +49 163 1474127`;

  cachedSystemPrompt = { text, until: now + 300_000 }; // 5 min TTL
  return text;
}

export async function runAgentTurn(
  chatId: number,
  userText: string,
  thinkMessageId?: number,
  imageBase64?: { data: string; media_type: string },
): Promise<void> {
  const startTime = Date.now();
  console.log('[agent] turn starting', { chatId, textLen: userText.length, hasImage: !!imageBase64 });

  // Wait for any previous turn on this chat to complete
  const previous = turnLocks.get(chatId);
  if (previous) {
    console.log('[agent] waiting for previous turn lock', { chatId });
    await previous;
    console.log('[agent] previous turn lock released', { chatId });
  }

  let resolveLock: () => void;
  const lock = new Promise<void>((r) => { resolveLock = r; });
  turnLocks.set(chatId, lock);

  let msgId = thinkMessageId ?? 0;

  // ── Reply delivery with safety ──
  // Always tries editMessageText first, falls back to sendMessage
  let replied = false;
  const deliverReply = async (text: string) => {
    if (replied || !text) return;
    replied = true;
    const safe = text.slice(0, 3500);
    if (msgId) {
      try {
        await editMessageText({ chatId, messageId: msgId, text: safe });
        console.log('[agent] reply delivered via edit', { chatId, len: safe.length });
        return;
      } catch (e) {
        console.error('[agent] editMessageText failed, falling back to sendMessage', e);
      }
    }
    await sendMessage({ chatId, text: safe }).catch(() => {});
    console.log('[agent] reply delivered via send', { chatId, len: safe.length });
  };

  // Read operational config from DB (with fallbacks)
  const [maxTurns, safetyTimeoutMs, swarmEnabled] = await Promise.all([
    getConfigNumber('agent_max_tool_turns', MAX_TOOL_TURNS),
    getConfigNumber('agent_safety_timeout_ms', 28_000),
    getConfigBool('agent_swarm_enabled', true),
  ]);

  // Safety timeout from DB config — guarantees user always gets some response
  const safetyTimer = setTimeout(() => {
    if (!replied) {
      console.error('[agent] SAFETY TIMEOUT — forcing reply', { chatId, elapsed: Date.now() - startTime });
      deliverReply('Islem cok uzun surdu. Lutfen tekrar deneyin veya daha spesifik bir istek yapin.').catch(() => {});
    }
  }, safetyTimeoutMs);

  try {
    const session = getOrCreateSession(chatId);

    // Build user content blocks
    const userContent: Anthropic.Messages.ContentBlockParam[] = [];
    if (imageBase64) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageBase64.media_type as 'image/jpeg' | 'image/png',
          data: imageBase64.data,
        },
      });
    }
    userContent.push({ type: 'text', text: userText });

    const userMsg: MessageParam = { role: 'user', content: userContent };
    session.messages.push(userMsg);

    // Trim history
    while (session.messages.length > MAX_CONTEXT_MESSAGES * 2) {
      session.messages.shift();
    }

    // Send or reuse thinking message
    if (!msgId) {
      const sent = await sendMessage({ chatId, text: '🤔 Dusunuyorum...' });
      msgId = sent.message_id;
    }

    // Swarm routing — only for messages with clear intent keywords
    // Short messages (<= 8 chars) skip swarm entirely
    // Can be disabled via DB config: update_system_config key=agent_swarm_enabled value=false
    const isShortMessage = userText.length <= 8;
    const swarmPromise = (isShortMessage || !swarmEnabled)
      ? Promise.resolve({ reply: '', delegatedTo: '', toolCalls: 0, swarmed: false } as const)
      : runSwarmTurn(userText, maxTurns);

    // Build system prompt in parallel with swarm
    const systemPromptPromise = buildSystemPrompt();

    const swarmResult = await swarmPromise;
    console.log('[agent] swarm result', { swarmed: swarmResult.swarmed, delegatedTo: swarmResult.delegatedTo, elapsed: Date.now() - startTime });

    if (swarmResult.swarmed && swarmResult.reply) {
      clearTimeout(safetyTimer);
      await deliverReply(swarmResult.reply);
      session.messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: swarmResult.reply }],
      });
      return;
    }

    const systemPrompt = await systemPromptPromise;
    console.log('[agent] system prompt ready', { len: systemPrompt.length, elapsed: Date.now() - startTime });

    let turnCount = 0;
    let finalText = '';

    while (turnCount < maxTurns) {
      console.log('[agent] starting turn', { turnCount, elapsed: Date.now() - startTime });

      const currentMessages: MessageParam[] = [
        ...session.messages.slice(-MAX_CONTEXT_MESSAGES),
      ];

      let accumulatedText = '';
      let lastEdit = 0;

      console.log('[agent] creating stream', { turnCount });
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: currentMessages,
        tools: AGENT_TOOLS as Anthropic.Messages.Tool[],
      });

      stream.on('text', (delta: string) => {
        accumulatedText += delta;
        const now = Date.now();
        if (now - lastEdit >= THROTTLE_EDIT_MS && accumulatedText.length < 3500) {
          lastEdit = now;
          editMessageText({
            chatId,
            messageId: msgId,
            text: accumulatedText + ' ▌',
          }).catch(() => {});
        }
      });

      const finalMsg = await stream.finalMessage();
      console.log('[agent] stream completed', {
        turnCount,
        textLen: accumulatedText.length,
        toolBlocks: finalMsg.content.filter(c => c.type === 'tool_use').length,
        elapsed: Date.now() - startTime,
      });

      // Collect text from final message
      const textBlocks = finalMsg.content.filter((c) => c.type === 'text');
      finalText = textBlocks.map((c) => (c as Anthropic.Messages.TextBlock).text).join('\n');

      // Collect tool_use blocks from final message
      const finalToolBlocks = finalMsg.content.filter(
        (c) => c.type === 'tool_use',
      ) as unknown as ToolUseBlock[];

      // No tools? Deliver reply and done.
      if (finalToolBlocks.length === 0) {
        clearTimeout(safetyTimer);
        await deliverReply(finalText);
        session.messages.push({ role: 'assistant', content: finalMsg.content as MessageParam['content'] });
        break;
      }

      // Show tool execution progress (non-critical — silent failure OK)
      const toolNames = finalToolBlocks.map((t) => t.name).join(', ');
      editMessageText({
        chatId,
        messageId: msgId,
        text: (finalText || 'Araclar calistiriliyor...') + `\n\n🔧 ${toolNames}`,
      }).catch(() => {});

      // Add assistant message with tool_use blocks
      session.messages.push({
        role: 'assistant',
        content: finalMsg.content as MessageParam['content'],
      });

      // Execute all tools in parallel
      const toolResults = await Promise.all(
        finalToolBlocks.map((tb) =>
          executeTool(tb.name, tb.id, (tb.input ?? {}) as Record<string, unknown>),
        ),
      );

      // Build tool_result blocks
      const toolResultContent: Anthropic.Messages.ToolResultBlockParam[] =
        toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.toolUseId,
          content: tr.content,
          is_error: tr.isError,
        }));

      session.messages.push({
        role: 'user',
        content: toolResultContent as MessageParam['content'],
      });

      turnCount++;
    }

    // If we got here without delivering a reply (e.g., MAX_TOOL_TURNS with tools only)
    if (!replied) {
      clearTimeout(safetyTimer);
      if (finalText) {
        await deliverReply(finalText);
      } else {
        await deliverReply('Cok fazla arac calistirildi. Lutfen daha spesifik bir istek yapin.');
      }
    }

    // Learn from conversation (non-blocking)
    if (finalText) {
      extractAndStoreMemories(userText, finalText).catch((e) =>
        console.error('[memory] extraction error:', e),
      );
    }
  } catch (err) {
    clearTimeout(safetyTimer);
    console.error('[agent] error caught', {
      chatId,
      elapsed: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    await deliverReply(
      `Asistan hatasi: ${err instanceof Error ? err.message.slice(0, 250) : 'Bilinmeyen hata'}`,
    );
  } finally {
    clearTimeout(safetyTimer);
    resolveLock!();
    turnLocks.delete(chatId);
    console.log('[agent] turn completed', { chatId, elapsed: Date.now() - startTime });
  }
}

export function clearAgentSession(chatId: number): void {
  sessions.delete(chatId);
}

export function getAgentSessionChatIds(): number[] {
  return Array.from(sessions.keys());
}
