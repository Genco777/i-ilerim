import { describe, it, expect } from 'vitest';
import {
  getAdsPreferences,
  updateAdsPreferences,
  DEFAULT_ADS_PREFERENCES,
} from '@/lib/db/queries/ads-preferences';

describe('ads preferences', () => {
  if (process.env.CI) return;

  it('returns defaults when no row exists', async () => {
    const prefs = await getAdsPreferences();
    expect(prefs.daily_limit_cents).toBe(DEFAULT_ADS_PREFERENCES.daily_limit_cents);
    expect(prefs.monthly_limit_cents).toBe(DEFAULT_ADS_PREFERENCES.monthly_limit_cents);
    expect(prefs.default_language_code).toBe('de');
  });

  it('returns updated limit after update', async () => {
    await updateAdsPreferences({ daily_limit_cents: 7500 });
    const prefs = await getAdsPreferences();
    expect(prefs.daily_limit_cents).toBe(7500);
    // Reset
    await updateAdsPreferences({
      daily_limit_cents: DEFAULT_ADS_PREFERENCES.daily_limit_cents,
    });
  });
});
