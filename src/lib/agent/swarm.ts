import Anthropic from '@anthropic-ai/sdk';
import type { SwarmAgent } from './agents';
import { ALL_AGENTS, AGENT_GROUPS, getAgentsByGroup } from './agents';
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
  maxTurns = 4,
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

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model: agent.model,
      max_tokens: 1600,
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

// Detect explicit group mention: "a grubu", "grup a", "b'ye sor", "b grubundan" etc.
// Only matches standalone letters a/b (not part of words)
function detectGroup(lower: string): 'A' | 'B' | null {
  // Check for group A mention
  if (/\bgrup[ -]?a\b|\ba[ -]?grubu\b|\ba[ -]?grubuna\b|\ba[ -]?grubundan\b|\ba[ -]?grubuyla\b/i.test(lower)) return 'A';
  // Check for group B mention
  if (/\bgrup[ -]?b\b|\bb[ -]?grubu\b|\bb[ -]?grubuna\b|\bb[ -]?grubundan\b|\bb[ -]?grubuyla\b/i.test(lower)) return 'B';
  return null;
}

// Orkestratör: kullanıcı mesajını analiz eder, uygun alt-ajana yönlendirir
export function routeToAgent(userMessage: string): { agent: SwarmAgent; confidence: number; reason: string; group?: 'A' | 'B' } {
  const lower = userMessage.toLowerCase();
  const explicitGroup = detectGroup(lower);

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
    'brief', 'konsept', 'vizitkart',
    'oluştur', 'oluşturma', 'resim', 'tasarla', 'çiz', 'grafik', 'maket',
    'menü', 'menu', 'katalog', 'afiş', 'poster', 'mockup', 'moodboard',
    'bild', 'generier', 'gestalte', 'zeichne', 'entwirf', 'plakat', 'speisekarte', 'menükarte'];
  const designMatches = designKeywords.filter((k) => lower.includes(k));
  const designScore = designMatches.length / Math.max(1, designKeywords.length);

  // Finans sinyalleri
  const financeKeywords = ['ciro', 'rapor', 'analiz', 'bütçe', 'budget', 'vergi', 'ads',
    'reklam', 'kampanya', 'performans', 'istatistik', 'özet', 'summary', 'revenue',
    'gelir', 'gider', 'nakit', 'cash', 'aylık', 'yıllık', 'veriler'];
  const financeMatches = financeKeywords.filter((k) => lower.includes(k));
  const financeScore = financeMatches.length / Math.max(1, financeKeywords.length);

  // Lüks pazar araştırma sinyalleri
  const luxuryResearchKeywords = ['pazar araştır', 'market research', 'trend', 'rakip analiz',
    'hedef kitle', 'lüks pazar', 'sektör raporu', 'marka değerleme', 'rekabet',
    'büyüme tahmini', 'pazar büyüklüğü', 'tüketici davranışı', 'segmentasyon',
    'luxury market', 'competitor', 'consumer insight', 'pazar analizi', 'fırsat'];
  const luxuryResearchMatches = luxuryResearchKeywords.filter((k) => lower.includes(k));
  const luxuryResearchScore = luxuryResearchMatches.length / Math.max(1, luxuryResearchKeywords.length);

  // Satın alma sinyalleri
  const buyerKeywords = ['tedarikçi', 'satın alma', 'ürün kataloğu', 'moq', 'birim maliyet',
    'lojistik', 'kalite kontrol', 'pazarlık', 'alım takvimi', 'stok', 'envanter',
    'supplier', 'sourcing', 'procurement', 'toptan', 'ithalat', 'ihracat',
    'minimum sipariş', 'marj', 'maliyet hesabı', 'tedarik zinciri'];
  const buyerMatches = buyerKeywords.filter((k) => lower.includes(k));
  const buyerScore = buyerMatches.length / Math.max(1, buyerKeywords.length);

  // Shopify / e-ticaret sinyalleri
  const shopifyKeywords = ['shopify', 'e-ticaret', 'ecommerce', 'mağaza', 'tema', 'theme',
    'checkout', 'ödeme', 'dönüşüm', 'conversion', 'cro', 'ürün sayfası', 'koleksiyon',
    'apps', 'klaviyo', 'mağaza kur', 'mağaza optimizasyonu', 'sipariş yönetimi',
    'e commerce', 'online satış', 'dijital mağaza', 'store', 'shop', 'sepet'];
  const shopifyMatches = shopifyKeywords.filter((k) => lower.includes(k));
  const shopifyScore = shopifyMatches.length / Math.max(1, shopifyKeywords.length);

  // Lüks pazarlama sinyalleri
  const luxuryMarketingKeywords = ['lüks pazarlama', 'marka stratejisi', 'konumlandırma',
    'influencer', 'kol', 'lansman', 'koleksiyon lansmanı', 'vip', 'lüks marka',
    'brand collab', 'co-branding', 'scarcity', 'exclusivity', 'miras', 'heritage',
    'lifestyle', 'statü', 'premium', 'luxury marketing', 'marka imajı', 'rebranding',
    'lüks segment', 'butik', 'niş', 'niche', 'zanaat', 'craftsmanship', 'el yapımı'];
  const luxuryMarketingMatches = luxuryMarketingKeywords.filter((k) => lower.includes(k));
  const luxuryMarketingScore = luxuryMarketingMatches.length / Math.max(1, luxuryMarketingKeywords.length);

  let scores: Array<{ agent: SwarmAgent; score: number; reason: string }> = [
    { agent: ALL_AGENTS.sales_agent!, score: salesScore, reason: `Satış sinyali: ${salesMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.social_agent!, score: socialScore, reason: `Sosyal medya sinyali: ${socialMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.design_agent!, score: designScore, reason: `Tasarım sinyali: ${designMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.finance_agent!, score: financeScore, reason: `Finans sinyali: ${financeMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.luxury_market_researcher!, score: luxuryResearchScore, reason: `Pazar araştırma: ${luxuryResearchMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.luxury_buyer!, score: buyerScore, reason: `Satın alma: ${buyerMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.luxury_shopify_director!, score: shopifyScore, reason: `Shopify/e-ticaret: ${shopifyMatches.join(', ') || 'genel'}` },
    { agent: ALL_AGENTS.luxury_marketing_director!, score: luxuryMarketingScore, reason: `Lüks pazarlama: ${luxuryMarketingMatches.join(', ') || 'genel'}` },
  ];

  // Group filter: when user says "a grubu" or "b grubu", only that group's agents
  if (explicitGroup) {
    const groupAgents = new Set(AGENT_GROUPS[explicitGroup].agents);
    scores = scores.filter((s) => groupAgents.has(s.agent.name));
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0]!;

  if (best.score < 0.05) {
    if (explicitGroup) {
      // Group explicitly asked but no strong signal — return top agent from that group anyway
      const groupInfo = AGENT_GROUPS[explicitGroup];
      return { agent: scores[0]?.agent ?? getAgentsByGroup(explicitGroup)[0]!, confidence: 0.05, reason: `${groupInfo.emoji} ${groupInfo.name} grubu istegi — en yakin uzman yonlendirildi`, group: explicitGroup };
    }
    // No strong signal — let main agent handle directly (faster, better for general chat)
    return { agent: ALL_AGENTS.sales_agent!, confidence: 0, reason: 'Genel sohbet — ana ajan yanıtlasın' };
  }

  return { agent: best.agent, confidence: best.score, reason: best.reason, group: explicitGroup ?? undefined };
}

// Ana delegasyon fonksiyonu
export async function delegateToAgent(
  agentName: string,
  task: string,
  context?: Record<string, unknown>,
  maxTurns = 4,
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

  return runSubAgentTurn(agent, task, context ?? {}, maxTurns);
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
  maxTurns = 4,
): Promise<{ reply: string; delegatedTo: string; toolCalls: number; swarmed: boolean }> {
  const route = routeToAgent(userMessage);

  // Düşük güven = ana ajan kendisi yanıtlasın (swarm yok)
  if (route.confidence < 0.08) {
    return { reply: '', delegatedTo: '', toolCalls: 0, swarmed: false };
  }

  const result = await delegateToAgent(route.agent.name, userMessage, undefined, maxTurns);

  const groupLabel = route.group ? ` │ ${AGENT_GROUPS[route.group].emoji} Grup ${route.group}` : '';

  return {
    reply: `*[${route.agent.emoji} ${route.agent.role}${groupLabel}]*\n\n${result.result}`,
    delegatedTo: route.agent.name,
    toolCalls: result.toolCalls,
    swarmed: true,
  };
}
