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

async function buildSystemPrompt(): Promise<string> {
  let businessProfile = '';
  try {
    const { loadMergedProfile } = await import('@/lib/kleinanzeigen/profile');
    businessProfile = await loadMergedProfile();
  } catch {
    businessProfile = 'Fly & Froth — Grafik- & Webdesign Studio, Karben (Hessen).';
  }

  return `Du bist der AI-Assistent von Fly & Froth (fly-froth.com), einem Grafik- und Webdesign-Studio in Karben (Hessen, Deutschland).

Inhaber: Mehmet Genco.
Sprache: Deutsch. Wenn Mehmet Türkisch schreibt, antworte auf Türkisch.

DEINE ROLLE:
- Business-Partner: Du kennst ALLE Projekte, Kunden, Abläufe
- Executor: Du TUST Dinge eigenständig mit deinen Tools — nicht nur beschreiben
- Mentor: Strategische Beratung für Unternehmenswachstum
- Designer: Du kannst Flyer, Logos, Grafiken entwerfen (generate_image, generate_svg)
- Kommunikator: Du hilfst bei Kundenkommunikation (Email, Kleinanzeigen, Social Media)

ZIEL:
Mehmet will €40.000+ monatlichen Umsatz erreichen. Jede Aktion und Empfehlung darauf ausrichten.
Hilf ihm durch: bessere Kundenkommunikation, mehr Sichtbarkeit, intelligentere Automatisierung, schnellere Abwicklung.

BUSINESS-KONTEXT (live von fly-froth.com):
${businessProfile}

HAFIZA (son 7 günde öğrenilen önemli bilgiler):
${await buildMemoryContext()}

KRITISCHE REGELN:
1. Wenn Mehmet dich bittet etwas zu tun (z.B. "erstell eine Rechnung", "schick eine Mail", "check die inbox"), dann TUE ES SOFORT mit den verfügbaren Tools. Frage NICHT ob du es tun sollst.
2. Wenn du unsicher bist, frage KURZ nach (max 1 Satz), dann handle.
3. Nach Tool-Ausführung: fasse ERGEBNISSE zusammen, nicht den Prozess.
4. Keine langen Erklärungen was du tun KÖNNTEST — tu es einfach.
5. Wenn ein Tool fehlschlägt, erkläre warum und biete Alternative.

DEIN STIL:
- Professionell, direkt, unternehmerisch
- Kurz und präzise — kein Geschwafel
- Max 1-2 Emojis pro Antwort
- Bullet Points für Listen, nicht Fließtext für alles

KONTAKTDATEN:
- Web: fly-froth.com
- Email: info@fly-froth.com
- Tel: +49 163 1474127
- Adresse: Röderweg 19, 61184 Karben
- Facebook: facebook.com/fly.froth
- Instagram: instagram.com/fly.froth
- WhatsApp: +49 163 1474127`;
}

export async function runAgentTurn(
  chatId: number,
  userText: string,
  thinkMessageId?: number,
  imageBase64?: { data: string; media_type: string },
): Promise<void> {
  // Wait for any previous turn on this chat to complete (back-to-back message safety)
  const previous = turnLocks.get(chatId);
  if (previous) await previous;

  let resolveLock: () => void;
  const lock = new Promise<void>((r) => { resolveLock = r; });
  turnLocks.set(chatId, lock);

  let msgId = thinkMessageId ?? 0;

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
    const sent = await sendMessage({ chatId, text: '🤔 Düşünüyorum...' });
    msgId = sent.message_id;
  }

  // Swarm routing: try to delegate to specialized sub-agent first
  const swarmResult = await runSwarmTurn(userText);
  if (swarmResult.swarmed && swarmResult.reply) {
    await editMessageText({
      chatId,
      messageId: msgId,
      text: swarmResult.reply,
    }).catch(() => {});
    session.messages.push({
      role: 'assistant',
      content: [{ type: 'text', text: swarmResult.reply }],
    });
    return;
  }

  const systemPrompt = await buildSystemPrompt();

  let turnCount = 0;
  let finalText = '';

  while (turnCount < MAX_TOOL_TURNS) {
      const currentMessages: MessageParam[] = [
        ...session.messages.slice(-MAX_CONTEXT_MESSAGES),
      ];

      let accumulatedText = '';
      const toolUseBlocks: ToolUseBlock[] = [];
      let lastEdit = 0;

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

      stream.on('contentBlock', (block) => {
        if (block.type === 'tool_use') {
          toolUseBlocks.push(block as unknown as ToolUseBlock);
        }
      });

      const finalMsg = await stream.finalMessage();

      // Collect text from final message
      const textBlocks = finalMsg.content.filter((c) => c.type === 'text');
      finalText = textBlocks.map((c) => (c as Anthropic.Messages.TextBlock).text).join('\n');

      // Collect tool_use blocks from final message (fallback if event missed them)
      const finalToolBlocks = finalMsg.content.filter(
        (c) => c.type === 'tool_use',
      ) as unknown as ToolUseBlock[];
      const allToolBlocks =
        toolUseBlocks.length > 0 ? toolUseBlocks : finalToolBlocks;

      // No tools? Done.
      if (allToolBlocks.length === 0) {
        await editMessageText({
          chatId,
          messageId: msgId,
          text: finalText.slice(0, 3500),
        }).catch(() => {});
        session.messages.push({ role: 'assistant', content: finalMsg.content as MessageParam['content'] });
        break;
      }

      // Show tool execution progress
      const toolNames = allToolBlocks.map((t) => t.name).join(', ');
      await editMessageText({
        chatId,
        messageId: msgId,
        text: (finalText || 'Araçlar çalıştırılıyor...') +
          `\n\n🔧 ${toolNames}`,
      }).catch(() => {});

      // Add assistant message with tool_use blocks
      session.messages.push({
        role: 'assistant',
        content: finalMsg.content as MessageParam['content'],
      });

      // Execute all tools in parallel
      const toolResults = await Promise.all(
        allToolBlocks.map((tb) =>
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

    if (turnCount >= MAX_TOOL_TURNS && !finalText) {
      await editMessageText({
        chatId,
        messageId: msgId,
        text: '⚠️ Çok fazla araç çalıştırıldı. Lütfen daha spesifik bir istek yap.',
      }).catch(() => {});
    }

    // Learn from conversation
    if (finalText) {
      extractAndStoreMemories(userText, finalText).catch((e) =>
        console.error('[memory] extraction error:', e),
      );
    }
  } catch (err) {
    console.error('[agent] error:', err);
    const errorText = `❌ Asistan hatası: ${
      err instanceof Error ? err.message.slice(0, 300) : 'Bilinmeyen hata'
    }`;
    try {
      await editMessageText({ chatId, messageId: msgId, text: errorText });
    } catch {
      await sendMessage({ chatId, text: errorText }).catch(() => {});
    }
  } finally {
    resolveLock!();
    turnLocks.delete(chatId);
  }
}

export function clearAgentSession(chatId: number): void {
  sessions.delete(chatId);
}

export function getAgentSessionChatIds(): number[] {
  return Array.from(sessions.keys());
}
