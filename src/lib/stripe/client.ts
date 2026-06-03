/**
 * Stripe SDK — server-side wrapper with lazy init.
 *
 * Used by:
 *   src/app/api/shop/checkout/route.ts       (create checkout session)
 *   src/app/api/webhooks/stripe/route.ts     (verify + handle events)
 *   src/lib/publish/stripe.adapter.ts        (create products / prices on approval)
 */

import Stripe from 'stripe';

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  _client = new Stripe(key, {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
    appInfo: { name: 'fly-froth-trend-engine', version: '0.1.0' },
  });
  return _client;
}

export function getStripeWebhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return s;
}

export function getStripeMode(): 'test' | 'live' {
  return (process.env.STRIPE_MODE ?? 'test') === 'live' ? 'live' : 'test';
}

export function getShopBaseUrl(): string {
  return process.env.SHOP_BASE_URL ?? 'https://fly-froth.com/shop';
}

/**
 * Kleinunternehmer §19 UStG mode. When true, no VAT is added to checkout
 * and the §19 disclaimer is shown on the receipt + shop pages.
 */
export function isKleinunternehmer(): boolean {
  return (process.env.TAX_MODE ?? 'kleinunternehmer') === 'kleinunternehmer';
}
