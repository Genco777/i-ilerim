import { describe, it, expect } from 'vitest';
import { getEmailPreferences, updateEmailPreferences, DEFAULT_THEME } from '@/lib/db/queries/email-preferences';

describe('email preferences', () => {
  if (process.env.CI) return;

  it('returns default theme when no row exists', async () => {
    const prefs = await getEmailPreferences();
    expect(prefs.theme).toBe(DEFAULT_THEME);
  });

  it('returns updated theme after update', async () => {
    await updateEmailPreferences('dark_gold');
    const prefs = await getEmailPreferences();
    expect(prefs.theme).toBe('dark_gold');
    // Reset
    await updateEmailPreferences(DEFAULT_THEME);
  });
});
