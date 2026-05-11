import { describe, it, expect } from 'vitest';
import { formatPlanForTelegram } from '@/lib/content/generate-plan';

describe('formatPlanForTelegram', () => {
  it('formats a plan with slots', () => {
    const plan = {
      id: '1',
      calendar_week: 20,
      year: 2026,
      status: 'draft' as const,
      telegram_chat_id: 123,
      created_at: new Date(),
      approved_at: null,
      telegram_message_id: null,
    };

    const slots = [
      {
        id: 's1',
        plan_id: '1',
        day_of_week: 0,
        time_slot: '18:30',
        pillar: 'insight' as const,
        channel: 'feed' as const,
        topic: 'Warum gutes Design kein Zufall ist',
        post_id: null,
        status: 'pending' as const,
        created_at: new Date(),
      },
      {
        id: 's2',
        plan_id: '1',
        day_of_week: 1,
        time_slot: '18:30',
        pillar: 'vitrine' as const,
        channel: 'feed' as const,
        topic: 'Website-Projekt Muster GmbH',
        post_id: null,
        status: 'pending' as const,
        created_at: new Date(),
      },
    ];

    const result = formatPlanForTelegram(plan, slots);
    expect(result).toContain('Woche 20');
    expect(result).toContain('Warum gutes Design');
    expect(result).toContain('Muster GmbH');
  });

  it('handles empty slots', () => {
    const plan = {
      id: '2',
      calendar_week: 21,
      year: 2026,
      status: 'draft' as const,
      telegram_chat_id: 123,
      created_at: new Date(),
      approved_at: null,
      telegram_message_id: null,
    };

    const result = formatPlanForTelegram(plan, []);
    expect(result).toContain('Woche 21');
    expect(result).toContain('2026');
  });
});
