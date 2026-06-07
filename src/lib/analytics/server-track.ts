/**
 * Server-side conversion tracking.
 *
 * iOS 14+ ATT + browser ad-blocker'lar client-side Pixel'i %20-40 oranında
 * kaybediyor. Server-side event'ler (Meta CAPI, GA4 Measurement Protocol,
 * Pinterest Conversions API) bu kaybı kapatır.
 *
 * Stripe webhook'tan `purchase` event'i hem client-side Pixel'e (success
 * sayfası) hem buradan server-side ATEŞLER → Meta event deduplication
 * `event_id` ile yapar (her iki kanaldan aynı `event_id` → tek conversion).
 *
 * Env'ler:
 *   META_CAPI_TOKEN        Meta Events Manager → Settings → Generate Access Token
 *   META_PIXEL_ID          Meta Pixel ID (NEXT_PUBLIC_META_PIXEL_ID ile aynı)
 *   GA4_MEASUREMENT_ID     G-XXXXXXXX (NEXT_PUBLIC_GA4_ID ile aynı)
 *   GA4_API_SECRET         GA4 Admin → Data Streams → Measurement Protocol API secret
 *   PINTEREST_ACCESS_TOKEN Pinterest API v5 access token (OAuth flow'dan)
 *   PINTEREST_AD_ACCOUNT_ID Pinterest Ad Account ID
 */

import crypto from 'crypto';

const META_CAPI_TOKEN          = process.env.META_CAPI_TOKEN;
const META_PIXEL_ID            = process.env.META_PIXEL_ID ?? process.env.NEXT_PUBLIC_META_PIXEL_ID;
const GA4_MEASUREMENT_ID       = process.env.GA4_MEASUREMENT_ID ?? process.env.NEXT_PUBLIC_GA4_ID;
const GA4_API_SECRET           = process.env.GA4_API_SECRET;
const PINTEREST_ACCESS_TOKEN   = process.env.PINTEREST_ACCESS_TOKEN;
const PINTEREST_AD_ACCOUNT_ID  = process.env.PINTEREST_AD_ACCOUNT_ID;

/** SHA256 hash (Meta CAPI PII gereksinimi) */
function sha256(input: string): string {
  return crypto.createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}

export interface PurchaseEvent {
  /** Eşsiz event ID — client-side Pixel ile dedup için. Stripe session.id kullan */
  eventId: string;
  /** Sipariş tutarı (EUR cinsinden, ondalık) */
  value: number;
  /** Currency ISO code */
  currency?: string;
  /** Alıcı email (hash'lenecek) */
  email?: string;
  /** Alıcı ülke kodu (2 harf, lowercase) */
  country?: string;
  /** Ürün ID (Stripe metadata.trend_product_id) */
  productId?: string;
  /** Ürün adı */
  productName?: string;
  /** Müşterinin client IP'si (Stripe webhook'tan gelmez — opsiyonel) */
  clientIp?: string;
  /** Client User-Agent (opsiyonel) */
  clientUserAgent?: string;
  /** fbp/fbc cookie değerleri (browser'dan webhook'a iletilirse) */
  fbp?: string;
  fbc?: string;
  /** Unix timestamp seconds */
  eventTime?: number;
}

/**
 * Meta Conversions API — Purchase event.
 * https://developers.facebook.com/docs/marketing-api/conversions-api/
 */
async function trackPurchaseMetaCapi(p: PurchaseEvent): Promise<void> {
  if (!META_CAPI_TOKEN || !META_PIXEL_ID) return;

  const userData: Record<string, unknown> = {};
  if (p.email)            userData.em = [sha256(p.email)];
  if (p.country)          userData.country = [sha256(p.country)];
  if (p.clientIp)         userData.client_ip_address = p.clientIp;
  if (p.clientUserAgent)  userData.client_user_agent = p.clientUserAgent;
  if (p.fbp)              userData.fbp = p.fbp;
  if (p.fbc)              userData.fbc = p.fbc;

  const body = {
    data: [{
      event_name:     'Purchase',
      event_time:     p.eventTime ?? Math.floor(Date.now() / 1000),
      event_id:       p.eventId,
      action_source:  'website',
      user_data:      userData,
      custom_data: {
        currency:    p.currency ?? 'EUR',
        value:       p.value,
        content_ids: p.productId ? [p.productId] : undefined,
        content_name: p.productName,
        content_type: 'product',
      },
    }],
  };

  try {
    const url = `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[meta-capi] purchase event failed', res.status, txt.slice(0, 300));
    }
  } catch (err) {
    console.warn('[meta-capi] purchase event error', err);
  }
}

/**
 * GA4 Measurement Protocol — purchase event.
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
async function trackPurchaseGA4(p: PurchaseEvent): Promise<void> {
  if (!GA4_MEASUREMENT_ID || !GA4_API_SECRET) return;

  // GA4 client_id — yoksa session.id'den deterministik üret
  const clientId = p.eventId;

  const body = {
    client_id: clientId,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: p.eventId,
        currency:       p.currency ?? 'EUR',
        value:          p.value,
        items: p.productId ? [{
          item_id:   p.productId,
          item_name: p.productName ?? p.productId,
          price:     p.value,
          quantity:  1,
        }] : [],
      },
    }],
  };

  try {
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[ga4-mp] purchase event failed', res.status, txt.slice(0, 300));
    }
  } catch (err) {
    console.warn('[ga4-mp] purchase event error', err);
  }
}

/**
 * Pinterest Conversions API — checkout event.
 * https://developers.pinterest.com/docs/conversions/conversions/
 */
async function trackPurchasePinterest(p: PurchaseEvent): Promise<void> {
  if (!PINTEREST_ACCESS_TOKEN || !PINTEREST_AD_ACCOUNT_ID) return;

  const userData: Record<string, unknown> = {};
  if (p.email)           userData.em = [sha256(p.email)];
  if (p.clientIp)        userData.client_ip_address = p.clientIp;
  if (p.clientUserAgent) userData.client_user_agent = p.clientUserAgent;

  const body = {
    data: [{
      event_name:    'checkout',
      action_source: 'web',
      event_time:    p.eventTime ?? Math.floor(Date.now() / 1000),
      event_id:      p.eventId,
      user_data:     userData,
      custom_data: {
        currency: p.currency ?? 'EUR',
        value:    String(p.value),
        content_ids: p.productId ? [p.productId] : undefined,
        content_name: p.productName,
      },
    }],
  };

  try {
    const url = `https://api.pinterest.com/v5/ad_accounts/${PINTEREST_AD_ACCOUNT_ID}/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINTEREST_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('[pinterest-capi] purchase event failed', res.status, txt.slice(0, 300));
    }
  } catch (err) {
    console.warn('[pinterest-capi] purchase event error', err);
  }
}

/**
 * Tek çağrı ile 3 servise paralel purchase event push.
 * Hiçbir hata Stripe webhook'unu fail etmemeli — log + swallow.
 */
export async function trackPurchaseServerSide(p: PurchaseEvent): Promise<void> {
  await Promise.allSettled([
    trackPurchaseMetaCapi(p),
    trackPurchaseGA4(p),
    trackPurchasePinterest(p),
  ]);
}
