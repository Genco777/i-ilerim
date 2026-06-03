/**
 * Public shop listing — /shop
 *
 * Shows all products with status='approved' or 'published' AND
 * is_public_in_shop=1, ordered by created_at DESC.
 *
 * Server component — pulls directly from Drizzle.
 */
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { StatementFooter } from '@/components/shop/StatementFooter';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // ISR — refresh listing every minute

export default async function ShopPage() {
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.shop_title,
      type: products.type,
      price_cents: products.price_cents,
      hero: products.hero_image_url,
    })
    .from(products)
    .where(
      and(
        eq(products.is_public_in_shop, 1),
        or(eq(products.status, 'approved'), eq(products.status, 'published')),
        sql`${products.slug} IS NOT NULL`,
      ),
    )
    .orderBy(desc(products.created_at))
    .limit(48);

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Shop</h1>
          <p className="mt-2 text-sm text-stone-600">
            Printable PDFs by Fly &amp; Froth. Instant download.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-12">
        {rows.length === 0 ? (
          <p className="text-stone-500">
            New drops coming soon. Check back in a day or two.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <li key={p.id} className="group">
                <Link href={`/shop/${p.slug}`} className="block">
                  {p.hero ? (
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
                      <Image
                        src={p.hero}
                        alt={p.title ?? 'Product'}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square rounded-lg bg-stone-200" />
                  )}
                  <h2 className="mt-3 text-sm font-medium text-stone-900 line-clamp-2">
                    {p.title}
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    €{(p.price_cents / 100).toFixed(2)} · {p.type.replace('_', ' ')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <StatementFooter />
    </main>
  );
}
