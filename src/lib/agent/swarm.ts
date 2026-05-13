import Anthropic from '@anthropic-ai/sdk';
import type { SwarmAgent } from './agents';
import { ALL_AGENTS } from './agents';
import { AGENT_TOOLS, executeTool } from './tools';
import type { AgentTool, ToolUseBlock, MessageParam } from './types';

export interface SwarmTask {
  agentName: string;
  task: string;
  context: Record<string, unknown>;
}

export interface SwarmResult {
  agentName: string;
  task: string;
  result: string;
  toolCalls: number;
  completed: boolean;
}

// Her alt-ajanın kendi tool'larını filtrele
function getToolDefinitions(agent: SwarmAgent): AgentTool[] {
  const allowedTools = new Set(agent.tools);
  return AGENT_TOOLS.filter((t) => allowedTools.has(t.name));
}

// Alt-ajanı bir tur çalıştır
async function runSubAgentTurn(
  agent: SwarmAgent,
  userMessage: string,
  context: Record<string, unknown>,
): Promise<SwarmResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const tools = getToolDefinitions(agent);
  let toolCalls = 0;

  const contextLines = Object.keys(context).length > 0
    ? `\n\nBAĞLAM:\n${JSON.stringify(context, null, 2)}`
    : '';

  const messages: MessageParam[] = [
    { role: 'user', content: `${userMessage}${contextLines}` },
  ];

  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 1200,
      system: [
        { type: 'text', text: agent.systemPrompt },
        {
          type: 'text',
          text: 'ÖNEMLİ: Görevi tamamladığında son yanıtında "GÖREV TAMAM" yaz. Tool kullanman gerekiyorsa kullan, sonra özetle.',
        },
      ],
      messages,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
    });

    const assistantMessage: MessageParam = { role: 'assistant', content: response.content };
    messages.push(assistantMessage);

    const textBlocks = response.content.filter((c) => c.type === 'text');
    const textOutput = textBlocks.map((t) => ('text' in t ? (t as { text: string }).text : '')).join('\n');

    // Alt-ajan görevi tamamladı mı?
    if (textOutput.includes('GÖREV TAMAM')) {
      return {
        agentName: agent.name,
        task: userMessage,
        result: textOutput.replace('GÖREV TAMAM', '').trim(),
        toolCalls,
        completed: true,
      };
    }

    const toolUses = response.content.filter((c) => c.type === 'tool_use');
    if (toolUses.length === 0) {
      return {
        agentName: agent.name,
        task: userMessage,
        result: textOutput,
        toolCalls,
        completed: true,
      };
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of toolUses) {
      const toolBlock = block as ToolUseBlock;
      const result = await executeTool(toolBlock.name, toolBlock.id, toolBlock.input as Record<string, unknown>);
      toolCalls++;
      toolResults.push({
        type: 'tool_result' as const,
        tool_use_id: toolBlock.id,
        content: result.isError ? `HATA: ${result.content}` : result.content,
      });
    }

    messages.push({ role: 'user', content: toolResults as Anthropic.Messages.ContentBlockParam[] });
  }

  return {
    agentName: agent.name,
    task: userMessage,
    result: 'Max tool tur sayısına ulaşıldı.',
    toolCalls,
    completed: false,
  };
}

// Orkestratör: kullanıcı mesajını analiz eder, uygun alt-ajana yönlendirir
export function routeToAgent(userMessage: string): { agent: SwarmAgent; confidence: number; reason: string } {
  const lower = userMessage.toLowerCase();

  // Satış sinyalleri
  const salesKeywords = ['preis', 'angebot', 'kosten', 'rechnung', 'kaufen', 'bestellen', 'auftrag',
    'teklif', 'fiyat', 'fatura', 'satın', 'sipariş', 'ödeme', 'zahlung', 'kunde', 'müşteri',
    'kleinanzeigen', 'ilan', 'thread', 'takip', 'follow-up', 'lead'];
  const salesMatches = salesKeywords.filter((k) => lower.includes(k));
  const salesScore = salesMatches.length / Math.max(1, salesKeywords.length);

  // Sosyal medya sinyalleri
  const socialKeywords = ['post', 'gönderi', 'instagram', 'facebook', 'story', 'reel', 'içerik',
    'content', 'plan', 'hashtag', 'yorum', 'comment', 'beğeni', 'takipçi', 'social',
    'haftalık plan', 'publish', 'yayınla', 'paylaş'];
  const socialMatches = socialKeywords.filter((k) => lower.includes(k));
  const socialScore = socialMatches.length / Math.max(1, socialKeywords.length);

  // Tasarım sinyalleri
  const designKeywords = ['logo', 'flyer', 'tasarım', 'design', 'renk', 'font', 'banner',
    'kartvizit', 'svg', 'görsel', 'image', 'broşür', 'web tasarım', 'revizyon',
    'brief', 'konsept', 'vizitkart'];
  const designMatches = designKeywords.filter((k) => lower.includes(k));
  const designScore = designMatches.length / Math.max(1, designKeywords.length);

  // Finans sinyalleri
  const financeKeywords = ['ciro', 'rapor', 'analiz', 'bütçe', 'budget', 'vergi', 'ads',
    'reklam', 'kampanya', 'performans', 'istatistik', 'özet', 'summary', 'revenue',
    'gelir', 'gider', 'nakit', 'cash', 'aylık', 'yıllık', 'veriler'];
  const financeMatches = financeKeywords.filter((k) => lower.includes(k));
  const financeScore = financeMatches.length / Math.max(1, financeKeywords.length);

  const scores: Array<{ agent: SwarmAgent; score: number; reason: string }> = [
    { agent: ALL_AGENTS.sales_agent!, score: salesScore, reason: `Satış sinyali: ${salesMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.social_agent!, score: socialScore, reason: `Sosyal medya sinyali: ${socialMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.design_agent!, score: designScore, reason: `Tasarım sinyali: ${designMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.finance_agent!, score: financeScore, reason: `Finans sinyali: ${financeMatches.join(', ') || 'genel'}` },
  ];

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;

  if (best.score < 0.05) {
    return { agent: ALL_AGENTS.sales_agent!, confidence: 0.3, reason: 'Varsayılan: satış ajanı (en genel yetkinlik)' };
  }

  return { agent: best.agent, confidence: best.score, reason: best.reason };
}

// Ana delegasyon fonksiyonu
export async function delegateToAgent(
  agentName: string,
  task: string,
  context?: Record<string, unknown>,
): Promise<SwarmResult> {
  const agent = ALL_AGENTS[agentName];
  if (!agent) {
    return {
      agentName,
      task,
      result: `HATA: "${agentName}" adında bir ajan yok. Mevcut: ${Object.keys(ALL_AGENTS).join(', ')}`,
      toolCalls: 0,
      completed: false,
    };
  }

  return runSubAgentTurn(agent, task, context ?? {});
}

// Paralel delegasyon — birden fazla ajana aynı anda görev ver
export async function delegateParallel(
  delegations: Array<{ agentName: string; task: string; context?: Record<string, unknown> }>,
): Promise<SwarmResult[]> {
  return Promise.all(delegations.map((d) => delegateToAgent(d.agentName, d.task, d.context)));
}

// Swarm modunda ana ajan yanıtını oluştur
export async function runSwarmTurn(
  userMessage: string,
): Promise<{ reply: string; delegatedTo: string; toolCalls: number; swarmed: boolean }> {
  const route = routeToAgent(userMessage);

  // Düşük güven = ana ajan kendisi yanıtlasın (swarm yok)
  if (route.confidence < 0.08) {
    return { reply: '', delegatedTo: '', toolCalls: 0, swarmed: false };
  }

  const result = await delegateToAgent(route.agent.name, userMessage);

  return {
    reply: `*[${route.agent.emoji} ${route.agent.role}]*\n\n${result.result}`,
    delegatedTo: route.agent.name,
    toolCalls: result.toolCalls,
    swarmed: true,
  };
}
