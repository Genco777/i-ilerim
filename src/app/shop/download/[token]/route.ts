/**
 * GET /shop/download/[token]
 *
 * Buyer clicks the link from their email. We:
 *   1. Look up the token row
 *   2. Verify not expired / not used up
 *   3. Increment use count
 *   4. Redirect (302) to the actual file URL on Vercel Blob
 *
 * If invalid, render a small HTML message explaining why.
 */

import { NextResponse } from 'next/server';
import { consumeToken } from '@/lib/shop/download-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  if (!token || token.length < 32) {
    return errorPage('Invalid link.');
  }

  const result = await consumeToken(token);

  if (!result.valid) {
    if (result.reason === 'not_found') {
      return errorPage('This download link is not recognised.');
    }
    if (result.reason === 'expired') {
      return errorPage(
        'This link has expired. Reply to your order email and we will send a fresh one.',
      );
    }
    if (result.reason === 'used_up') {
      return errorPage(
        'This link has reached its maximum number of uses. Reply to your order email for a new link.',
      );
    }
  }

  if (!result.digitalFileUrl) {
    return errorPage('The file is temporarily unavailable. Please contact us.');
  }

  return NextResponse.redirect(result.digitalFileUrl, { status: 302 });
}

function errorPage(message: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Download unavailable</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c1916; background: #fbfaf6; max-width: 560px; margin: 60px auto; padding: 24px; line-height: 1.6; }
h1 { font-size: 20px; margin-bottom: 12px; }
a { color: #1c1916; }
</style></head><body>
<h1>Download unavailable</h1>
<p>${message.replace(/</g, '&lt;')}</p>
<p style="margin-top: 32px; font-size: 12px; color: #6b6b6b;">
  Fly &amp; Froth · Karben, Germany · <a href="https://www.fly-froth.com">www.fly-froth.com</a>
</p></body></html>`;
  return new Response(html, {
    status: 410,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
