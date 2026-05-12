import { describe, it, expect } from 'vitest';
import {
  campaignTypeKeyboard,
  conversionGoalKeyboard,
  adsPreviewKeyboard,
  adsCancelKeyboard,
  nextStep,
} from '@/lib/telegram/ads-keyboard';

describe('ads-keyboard', () => {
  it('exposes 5 campaign types in the type keyboard', () => {
    const kb = campaignTypeKeyboard('draft-1');
    const buttons = kb.inline_keyboard.flat();
    const callbacks = buttons.map((b) => b.callback_data!);
    expect(callbacks).toContain('ads_type:draft-1:search');
    expect(callbacks).toContain('ads_type:draft-1:pmax');
    expect(callbacks).toContain('ads_type:draft-1:display');
    expect(callbacks).toContain('ads_type:draft-1:retargeting');
    expect(callbacks).toContain('ads_type:draft-1:local');
  });

  it('conversion goal keyboard exposes 4 goals + skip', () => {
    const kb = conversionGoalKeyboard('draft-1');
    const callbacks = kb.inline_keyboard.flat().map((b) => b.callback_data!);
    expect(callbacks).toEqual(
      expect.arrayContaining([
        'ads_goal:draft-1:lead_form',
        'ads_goal:draft-1:whatsapp',
        'ads_goal:draft-1:call',
        'ads_goal:draft-1:purchase',
        'ads_goal:draft-1:none',
      ]),
    );
  });

  it('preview keyboard has approve/regenerate/cancel', () => {
    const kb = adsPreviewKeyboard('draft-1');
    const callbacks = kb.inline_keyboard.flat().map((b) => b.callback_data!);
    expect(callbacks).toEqual(
      expect.arrayContaining([
        'ads_approve:draft-1',
        'ads_regen:draft-1',
        'ads_cancel:draft-1',
      ]),
    );
  });

  it('nextStep returns correct transitions', () => {
    expect(nextStep('type')).toBe('target');
    expect(nextStep('target')).toBe('budget');
    expect(nextStep('budget')).toBe('copy_review');
    expect(nextStep('copy_review')).toBe('approval');
    expect(nextStep('approval')).toBe(null);
  });

  it('cancel keyboard renders a single cancel button', () => {
    const kb = adsCancelKeyboard('draft-1');
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]).toHaveLength(1);
    expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('ads_cancel:draft-1');
  });
});
