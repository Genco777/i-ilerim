import { remember, recall, searchMemories, getImportantMemories, forgetMemories } from '@/lib/db/queries/memories';

// Extract new knowledge from conversation and store as memories
export async function extractAndStoreMemories(
  userMessage: string,
  assistantResponse: string,
): Promise<string[]> {
  const keys: string[] = [];

  // Customer budget mentions
  const budgetMatch = userMessage.match(
    /(?:€|EUR)\s*(\d+[\d.]*)\s*(?:bütçe|budget|fiyat|preis|kosten)/i,
  );
  if (budgetMatch) {
    await remember('preference', `budget_mention_${Date.now()}`, {
      amount: budgetMatch[1],
      context: userMessage.slice(0, 200),
    }, 6);
    keys.push('budget');
  }

  // Discount mentions
  const discountMatch = userMessage.match(
    /(%|yüzde)\s*(\d+)\s*(indirim|discount|rabatt|nachlass)/i,
  );
  if (discountMatch) {
    await remember('customer', `discount_mention_${Date.now()}`, {
      percent: discountMatch[2],
      context: userMessage.slice(0, 200),
    }, 7);
    keys.push('discount');
  }

  // Payment behavior
  if (/(?:geç\s*öd|gecik|late\s*pay|ödemez|zahlt\s*nicht)/i.test(userMessage)) {
    await remember('customer', `payment_issue_${Date.now()}`, {
      context: userMessage.slice(0, 200),
    }, 8);
    keys.push('payment_behavior');
  }

  // Content performance insights
  if (/(?:daha\s*çok\s*etkileşim|reach|engagement|tıklama|click)/i.test(userMessage)) {
    await remember('insight', `content_performance_${Date.now()}`, {
      context: userMessage.slice(0, 200),
      response: assistantResponse.slice(0, 200),
    }, 5);
    keys.push('content_performance');
  }

  // Competitor mentions
  if (/(?:rakip|competitor|konkurrent)/i.test(userMessage)) {
    await remember('insight', `competitor_${Date.now()}`, {
      context: userMessage.slice(0, 200),
    }, 6);
    keys.push('competitor');
  }

  // Customer preferences
  if (/(?:tercih|prefer|sev|like|istiyor)/i.test(userMessage)) {
    await remember('preference', `preference_${Date.now()}`, {
      context: userMessage.slice(0, 200),
    }, 5);
    keys.push('preference');
  }

  // Tool decisions
  if (/(?:seç|wähle|choose|karar)/i.test(assistantResponse)) {
    await remember('decision', `decision_${Date.now()}`, {
      context: userMessage.slice(0, 200),
      decision: assistantResponse.slice(0, 300),
    }, 7);
    keys.push('decision');
  }

  return keys;
}

// Build memory section for system prompt injection
export async function buildMemoryContext(): Promise<string> {
  try {
    const memories = await getImportantMemories(15);
    if (memories.length === 0) return '';

    const lines: string[] = [];
    lines.push('YAKIN ZAMANDA OGRENILENLER:');

    const byCategory: Record<string, typeof memories> = {};
    for (const m of memories) {
      if (!byCategory[m.category]) byCategory[m.category] = [];
      byCategory[m.category]!.push(m);
    }

    for (const [category, items] of Object.entries(byCategory)) {
      const emoji = categoryIcons[category] ?? '📌';
      for (const item of items) {
        const value = typeof item.value === 'object' && item.value !== null
          ? (item.value as Record<string, unknown>)
          : { value: item.value };
        const context = value.context ?? value.decision ?? JSON.stringify(value).slice(0, 150);
        lines.push(`${emoji} [${item.importance}/10] ${context}`);
      }
    }

    return lines.join('\n');
  } catch (err) {
    console.error('[memory] buildMemoryContext failed:', err instanceof Error ? err.message : String(err));
    return '';
  }
}

const categoryIcons: Record<string, string> = {
  customer: '👤',
  preference: '⭐',
  lesson: '📚',
  insight: '💡',
  fact: '📋',
  decision: '✅',
};
