/**
 * Subdomain-aware URL rewriting.
 *
 * shop.fly-froth.com is dedicated to the public storefront. So we expose
 * clean customer URLs at the root of that subdomain, and rewrite them
 * internally onto the /shop/* App Router pages.
 *
 *   shop.fly-froth.com/                     → /shop
 *   shop.fly-froth.com/[slug]               → /shop/[slug]
 *   shop.fly-froth.com/success?session_id=… → /shop/success?session_id=…
 *   shop.fly-froth.com/download/[token]     → /shop/download/[token]
 *
 * admin.fly-froth.com keeps the original routes unchanged (cron, webhooks,
 * admin pages, etc.) so internal links don't change.
 *
 * /api/* and Next.js internals (_next, favicon) are never rewritten.
 */
import { NextResponse, type NextRequest } from 'next/server';

const SHOP_HOST = 'shop.fly-froth.com';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const { pathname, search } = req.nextUrl;

  // Only rewrite traffic on the shop subdomain
  if (!host.startsWith(SHOP_HOST)) return NextResponse.next();

  // Never rewrite API / Next.js internals / static assets
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/branding') ||
    pathname.startsWith('/mockup-templates') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Already on a /shop path → leave it alone (defence in depth)
  if (pathname === '/shop' || pathname.startsWith('/shop/')) {
    return NextResponse.next();
  }

  // Root of shop subdomain → list page
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/shop';
    return NextResponse.rewrite(url);
  }

  // Everything else gets prefixed with /shop
  const url = req.nextUrl.clone();
  url.pathname = `/shop${pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files at the matcher level too,
    // so this middleware only runs on dynamic requests.
    '/((?!_next/|favicon|branding|mockup-templates).*)',
  ],
};
