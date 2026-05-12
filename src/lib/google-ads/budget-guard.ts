import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import { sumActiveDailyBudgetCents } from '@/lib/db/queries/ads-campaigns';
import { getCustomerCurrency } from '@/lib/google-ads/client';
import type { BudgetCheckResult, CampaignDraft } from './types';

const DAYS_PER_MONTH_FOR_PROJECTION = 30;

export async function checkBudget(draft: CampaignDraft): Promise<BudgetCheckResult> {
  if (!draft.daily_budget_cents || draft.daily_budget_cents <= 0) {
    return {
      ok: false,
      reason: 'invalid_budget',
      message: 'Günlük bütçe sıfırdan büyük olmalı.',
    };
  }

  const prefs = await getAdsPreferences();

  if (draft.daily_budget_cents > prefs.daily_limit_cents) {
    return {
      ok: false,
      reason: 'daily_limit_exceeded',
      message: `Günlük limit €${(prefs.daily_limit_cents / 100).toFixed(2)} aşıldı.`,
    };
  }

  const activeDailySum = await sumActiveDailyBudgetCents();
  const projectedMonthly =
    (activeDailySum + draft.daily_budget_cents) * DAYS_PER_MONTH_FOR_PROJECTION;
  if (projectedMonthly > prefs.monthly_limit_cents) {
    return {
      ok: false,
      reason: 'monthly_projection_exceeded',
      message: `Aylık projeksiyon €${(projectedMonthly / 100).toFixed(2)} > limit €${(prefs.monthly_limit_cents / 100).toFixed(2)}.`,
    };
  }

  const currency = await getCustomerCurrency();
  if (currency !== 'EUR') {
    return {
      ok: false,
      reason: 'currency_mismatch',
      message: `Google Ads hesap para birimi ${currency} — sistem EUR varsayıyor.`,
    };
  }

  return { ok: true };
}
