/**
 * Download token helpers — signed, single-purchase deliverable links.
 *
 * Each token:
 *   - 32 bytes hex (256-bit entropy)
 *   - tied to a product + sale row
 *   - expires after 24h
 *   - max 5 uses (prevents link-resharing on social)
 */

import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { downloadTokens, products } from '@/lib/db/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { getShopBaseUrl } from '@/lib/stripe/client';

const TTL_HOURS = 24;
const MAX_USES = 5;

export function generateTokenString(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Creates a fresh download token row for a (product, sale, buyer).
 * Returns the public URL the buyer should click.
 */
export async function issueDownloadToken(opts: {
  productId: string;
  saleId: string;
  buyerEmail: string | null;
}): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = generateTokenString();
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000);

  await db.insert(downloadTokens).values({
    token,
    product_id: opts.productId,
    sale_id: opts.saleId,
    buyer_email: opts.buyerEmail,
    expires_at: expiresAt,
    max_uses: MAX_USES,
  });

  const url = `${getShopBaseUrl().replace(/\/+$/, '')}/download/${token}`;
  return { token, url, expiresAt };
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: 'not_found' | 'expired' | 'used_up';
  productId?: string;
  digitalFileUrl?: string | null;
}

/**
 * Validates a token and, if valid, increments use count atomically.
 * Returns the file URL the buyer should be redirected to.
 */
export async function consumeToken(tokenStr: string): Promise<TokenValidationResult> {
  // 1) Find the token row
  const rows = await db
    .select({
      id: downloadTokens.id,
      product_id: downloadTokens.product_id,
      sale_id: downloadTokens.sale_id,
      expires_at: downloadTokens.expires_at,
      used_count: downloadTokens.used_count,
      max_uses: downloadTokens.max_uses,
    })
    .from(downloadTokens)
    .where(eq(downloadTokens.token, tokenStr))
    .limit(1);

  const t = rows[0];
  if (!t) return { valid: false, reason: 'not_found' };

  if (t.expires_at.getTime() < Date.now()) {
    return { valid: false, reason: 'expired', productId: t.product_id };
  }

  if (t.used_count >= t.max_uses) {
    return { valid: false, reason: 'used_up', productId: t.product_id };
  }

  // 2) Increment use count (atomic via SQL where clause guarding max_uses)
  const updated = await db
    .update(downloadTokens)
    .set({ used_count: t.used_count + 1 })
    .where(
      and(
        eq(downloadTokens.id, t.id),
        lt(downloadTokens.used_count, downloadTokens.max_uses),
        gt(downloadTokens.expires_at, new Date()),
      ),
    )
    .returning({ id: downloadTokens.id });

  if (!updated[0]) {
    // Race condition — another request consumed the last use first.
    return { valid: false, reason: 'used_up', productId: t.product_id };
  }

  // 3) Look up the product's deliverable file URL.
  // Sprint G — if the sale was personalized (Pro tier with custom_name),
  // serve the regenerated personalized PDF instead of the standard one.
  const { productSales } = await import('@/lib/db/schema');
  const saleRows = t.sale_id
    ? await db
        .select({ personalized_file_url: productSales.personalized_file_url })
        .from(productSales)
        .where(eq(productSales.id, t.sale_id))
        .limit(1)
    : [];
  const personalizedUrl = saleRows[0]?.personalized_file_url ?? null;

  const productRows = await db
    .select({ digital_file_url: products.digital_file_url })
    .from(products)
    .where(eq(products.id, t.product_id))
    .limit(1);

  return {
    valid: true,
    productId: t.product_id,
    digitalFileUrl: personalizedUrl ?? productRows[0]?.digital_file_url ?? null,
  };
}
