/**
 * Client-side Purchase event tracker for shop success page.
 *
 * Server side Stripe webhook'undan da aynı event_id ile event gönderilir;
 * Meta/Pinterest CAPI bu eşleşmeyi `event_id` üzerinden dedup'lar → tek
 * conversion. Hem client hem server göndermek iOS14/ad-blocker kaybını minimize
 * eder (browser engellense bile server-side gönderim devam eder ve tersi).
 */
'use client';

import { useEffect } from 'react';

interface PurchaseTrackerProps {
  /** Stripe session.id — Meta/GA4/Pinterest event_id olarak kullanılır */
  sessionId: string;
  /** Satış değeri (EUR) */
  value: number;
  /** ISO currency */
  currency?: string;
  /** Ürün ID (Stripe metadata.trend_product_id) */
  productId?: string;
  /** Ürün adı */
  productName?: string;
}

export function PurchaseTracker(p: PurchaseTrackerProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // sessionStorage flag — sayfa refresh'de tekrar fire etmesin
    const key = `purchase_fired_${p.sessionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* private mode */ }

    const w = window as unknown as { gtag?: Function; fbq?: Function; pintrk?: Function };
    const currency = p.currency ?? 'EUR';

    // GA4
    w.gtag?.('event', 'purchase', {
      transaction_id: p.sessionId,
      value:          p.value,
      currency,
      items: p.productId ? [{
        item_id:   p.productId,
        item_name: p.productName ?? p.productId,
        price:     p.value,
        quantity:  1,
      }] : [],
    });

    // Meta Pixel — event_id ile server-side ile dedup
    w.fbq?.('track', 'Purchase', {
      value:        p.value,
      currency,
      content_ids:  p.productId ? [p.productId] : undefined,
      content_name: p.productName,
      content_type: 'product',
    }, { eventID: p.sessionId });

    // Pinterest
    w.pintrk?.('track', 'checkout', {
      value:    p.value,
      order_id: p.sessionId,
      currency,
      line_items: p.productId ? [{
        product_id:    p.productId,
        product_name:  p.productName ?? p.productId,
        product_price: p.value,
      }] : [],
    });
  }, [p.sessionId, p.value, p.currency, p.productId, p.productName]);

  return null;
}
