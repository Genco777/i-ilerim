import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudget } from '@/lib/google-ads/budget-guard';
import type { CampaignDraft } from '@/lib/google-ads/types';

vi.mock('@/lib/db/queries/ads-preferences', () => ({
  getAdsPreferences: vi.fn(),
}));
vi.mock('@/lib/db/queries/ads-campaigns', () => ({
  sumActiveDailyBudgetCents: vi.fn(),
}));
vi.mock('@/lib/google-ads/client', () => ({
  getCustomerCurrency: vi.fn(),
}));

const baseDraft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
  type: 'search',
  name: 'Test',
  target_url: 'https://fly-froth.com',
  conversion_action: null,
  daily_budget_cents: 1000,
  start_date: '2026-05-12',
  end_date: null,
  language_code: 'de',
  location_id: 2276,
  headlines: ['h'],
  descriptions: ['d'],
  keywords: [],
  ...overrides,
});

import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import { sumActiveDailyBudgetCents } from '@/lib/db/queries/ads-campaigns';
import { getCustomerCurrency } from '@/lib/google-ads/client';

beforeEach(() => {
  vi.mocked(getAdsPreferences).mockResolvedValue({
    id: 1,
    daily_limit_cents: 5000,
    monthly_limit_cents: 100000,
    default_location_id: 2276,
    default_language_code: 'de',
    notify_anomaly_threshold_pct: 300,
    report_chat_id: null,
    updated_at: new Date(),
  });
  vi.mocked(sumActiveDailyBudgetCents).mockResolvedValue(0);
  vi.mocked(getCustomerCurrency).mockResolvedValue('EUR');
});

describe('checkBudget', () => {
  it('accepts a draft within daily limit', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 3000 }));
    expect(result.ok).toBe(true);
  });

  it('rejects daily budget over daily_limit_cents', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 6000 }));
    expect(result).toMatchObject({ ok: false, reason: 'daily_limit_exceeded' });
  });

  it('rejects when monthly projection exceeds monthly_limit_cents', async () => {
    vi.mocked(sumActiveDailyBudgetCents).mockResolvedValue(3000); // €30/day already running
    // 3000 + 2000 = 5000/day * 30 = 150000 > 100000
    const result = await checkBudget(baseDraft({ daily_budget_cents: 2000 }));
    expect(result).toMatchObject({ ok: false, reason: 'monthly_projection_exceeded' });
  });

  it('rejects non-EUR customer currency', async () => {
    vi.mocked(getCustomerCurrency).mockResolvedValue('USD');
    const result = await checkBudget(baseDraft());
    expect(result).toMatchObject({ ok: false, reason: 'currency_mismatch' });
  });

  it('rejects zero or negative budget', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 0 }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid_budget' });
  });
});
