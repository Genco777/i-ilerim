/**
 * Public shop listing — / on shop.fly-froth.com
 *
 * Lists every product with status='approved'/'published' AND is_public_in_shop=1.
 * Server component; revalidates every minute (ISR).
 */
import Link from 'next/link';
import Image from 'next/image';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { TrustStrip } from '@/components/shop/TrustStrip';
import { StatementFooter } from '@/components/shop/StatementFooter';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

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
    <main className="min-h-screen bg-background">
      <ShopHeader />

      {/* Hero */}
      <section className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <p className="text-xs tracking-[0.22em] uppercase text-muted-foreground">
            Fly &amp; Froth · Printables
          </p>
          <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight text-foreground max-w-2xl leading-[1.05]">
            Editorial printables, designed in a Karben studio.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
            Considered PDFs for the people generic templates never quite fit.
            Instant download, real human support, fair pricing.
          </p>
        </div>
      </section>

      <TrustStrip />

      {/* Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="text-2xl font-semibold text-foreground">All printables</h2>
          <p className="text-sm text-muted-foreground">{rows.length} item{rows.length === 1 ? '' : 's'}</p>
        </div>

        {rows.length === 0 ? (
          <div className="border border-border rounded-xl bg-card px-8 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              New drops coming soon. Check back in a day or two — or{' '}
              <a href="mailto:info@fly-froth.com" className="underline text-foreground">
                email us
              </a>{' '}
              for a custom commission.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${p.slug}`}
                  className="group block border border-border rounded-xl overflow-hidden bg-card hover:border-foreground/20 transition-colors"
                >
                  {p.hero ? (
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <Image
                        src={p.hero}
                        alt={p.title ?? 'Product'}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square bg-muted" />
                  )}
                  <div className="p-5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.type.replace('_', ' ')}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-foreground line-clamp-2 leading-snug">
                      {p.title}
                    </h3>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      €{(p.price_cents / 100).toFixed(2)}
                    </p>
                  </div>
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
