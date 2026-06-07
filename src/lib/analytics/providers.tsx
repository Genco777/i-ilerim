/**
 * Analytics providers — client-side tag injection.
 *
 * Tek `<AnalyticsProviders>` componenti GA4 + Meta Pixel + Pinterest Tag'i
 * birden yükler. Env tanımlı olmayan provider sessizce skip edilir.
 *
 * Kullanım: app/layout.tsx içinde `<body>` altına ekle.
 *
 * Env'ler (NEXT_PUBLIC_* olmak zorunda — client-side):
 *   NEXT_PUBLIC_GA4_ID            G-XXXXXXXX
 *   NEXT_PUBLIC_META_PIXEL_ID     16-haneli sayı
 *   NEXT_PUBLIC_PINTEREST_TAG_ID  Pinterest "Tag ID" (Conversions → Tags)
 *
 * Sunucu-taraflı kapatma (debug/dev için):
 *   NEXT_PUBLIC_ANALYTICS_DISABLED=1
 */
'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const GA4_ID            = process.env.NEXT_PUBLIC_GA4_ID;
const META_PIXEL_ID     = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const PINTEREST_TAG_ID  = process.env.NEXT_PUBLIC_PINTEREST_TAG_ID;
const DISABLED          = process.env.NEXT_PUBLIC_ANALYTICS_DISABLED === '1';

/**
 * Tüm tag'leri tek componentten yükler. Yalnızca env tanımlıysa render eder.
 */
export function AnalyticsProviders() {
  if (DISABLED) return null;
  return (
    <>
      {GA4_ID            && <GA4 measurementId={GA4_ID} />}
      {META_PIXEL_ID     && <MetaPixel pixelId={META_PIXEL_ID} />}
      {PINTEREST_TAG_ID  && <PinterestTag tagId={PINTEREST_TAG_ID} />}
      <RouteChangeTracker />
    </>
  );
}

// ── GA4 ────────────────────────────────────────────────────────────────────────

function GA4({ measurementId }: { measurementId: string }) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', '${measurementId}', { send_page_view: true });
      `}</Script>
    </>
  );
}

// ── Meta Pixel ────────────────────────────────────────────────────────────────

function MetaPixel({ pixelId }: { pixelId: string }) {
  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">{`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}</Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}

// ── Pinterest Tag ─────────────────────────────────────────────────────────────

function PinterestTag({ tagId }: { tagId: string }) {
  return (
    <>
      <Script id="pinterest-tag-init" strategy="afterInteractive">{`
        !function(e){if(!window.pintrk){window.pintrk = function () {
        window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
          n=window.pintrk;n.queue=[],n.version="3.0";var
          t=document.createElement("script");t.async=!0,t.src=e;var
          r=document.getElementsByTagName("script")[0];
          r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
        pintrk('load', '${tagId}', { em: '<user_email_address>' });
        pintrk('page');
      `}</Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          height="1"
          width="1"
          style={{ display: 'none' }}
          src={`https://ct.pinterest.com/v3/?event=init&tid=${tagId}&pd[em]=&noscript=1`}
        />
      </noscript>
    </>
  );
}

// ── SPA route change tracker — Next App Router için manuel page_view ──────────

function RouteChangeTracker() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '');

    // GA4 — explicit page_view (autoconfig zaten gönderiyor ama SPA navigation için manuel daha güvenilir)
    if (typeof window !== 'undefined' && 'gtag' in window && GA4_ID) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag('event', 'page_view', {
        page_path: url,
        page_location: window.location.href,
      });
    }

    // Meta Pixel
    if (typeof window !== 'undefined' && 'fbq' in window && META_PIXEL_ID) {
      (window as unknown as { fbq: (...args: unknown[]) => void }).fbq('track', 'PageView');
    }

    // Pinterest
    if (typeof window !== 'undefined' && 'pintrk' in window && PINTEREST_TAG_ID) {
      (window as unknown as { pintrk: (...args: unknown[]) => void }).pintrk('page');
    }
  }, [pathname, searchParams]);

  return null;
}

// ── Client-side event helpers (component'lerden çağrılır) ─────────────────────

/** Ürün sayfası view — product detail page'inde useEffect ile çağır */
export function trackViewItem(p: { id: string; name: string; price: number; currency?: string }) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { gtag?: Function; fbq?: Function; pintrk?: Function };

  w.gtag?.('event', 'view_item', {
    currency: p.currency ?? 'EUR',
    value: p.price,
    items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }],
  });

  w.fbq?.('track', 'ViewContent', {
    content_ids: [p.id],
    content_name: p.name,
    content_type: 'product',
    value: p.price,
    currency: p.currency ?? 'EUR',
  });

  w.pintrk?.('track', 'pagevisit', {
    line_items: [{ product_id: p.id, product_name: p.name, product_price: p.price }],
  });
}

/** Sepete eklendi / checkout başlatıldı */
export function trackBeginCheckout(p: { id: string; name: string; price: number; currency?: string }) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { gtag?: Function; fbq?: Function; pintrk?: Function };

  w.gtag?.('event', 'begin_checkout', {
    currency: p.currency ?? 'EUR',
    value: p.price,
    items: [{ item_id: p.id, item_name: p.name, price: p.price, quantity: 1 }],
  });

  w.fbq?.('track', 'InitiateCheckout', {
    content_ids: [p.id],
    value: p.price,
    currency: p.currency ?? 'EUR',
    num_items: 1,
  });

  w.pintrk?.('track', 'addtocart', {
    value: p.price,
    currency: p.currency ?? 'EUR',
    line_items: [{ product_id: p.id, product_name: p.name, product_price: p.price }],
  });
}
