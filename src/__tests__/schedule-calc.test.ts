import { describe, it, expect } from 'vitest';
import { calculateScheduledAt } from '@/lib/content/schedule-calc';

describe('calculateScheduledAt', () => {
  it('returns correct date for Monday 18:30 in week 20 of 2026', () => {
    // KW20/2026 Monday = 2026-05-11, 18:30 CEST = 16:30 UTC
    const result = calculateScheduledAt(20, 2026, 0, '18:30');
    expect(result.toISOString()).toBe('2026-05-11T16:30:00.000Z');
  });

  it('returns correct date for Saturday 12:00 in week 20 of 2026', () => {
    // KW20/2026 Saturday = 2026-05-16, 12:00 CEST = 10:00 UTC
    const result = calculateScheduledAt(20, 2026, 5, '12:00');
    expect(result.toISOString()).toBe('2026-05-16T10:00:00.000Z');
  });

  it('handles Sunday (day_of_week=6)', () => {
    // KW20/2026 Sunday = 2026-05-17, 09:00 CEST = 07:00 UTC
    const result = calculateScheduledAt(20, 2026, 6, '09:00');
    expect(result.toISOString()).toBe('2026-05-17T07:00:00.000Z');
  });

  it('returns valid Date for any input', () => {
    const result = calculateScheduledAt(1, 2026, 3, '14:45');
    expect(result instanceof Date).toBe(true);
    expect(isNaN(result.getTime())).toBe(false);
  });
});
