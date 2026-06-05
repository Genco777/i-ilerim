/**
 * Bundle detail page — /shop/bundle/[slug]
 * Lists the products in the bundle, shows the discounted bundle price,
 * "Buy bundle" button POSTs to /api/shop/bundle-checkout.
 */
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { products, productBundles } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { StatementFooter } from '@/components/shop/StatementFooter';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BundleDetail(props: PageProps) {
  const { slug } = await props.params;

  const bundleRows = await db
    .select()
    .from(productBundles)
    .where(
      and(eq(productBundles.slug, slug), eq(productBundles.is_public_in_shop, 1)),
    )
    .limit(1);
  const bundle = bundleRows[0];
  if (!bundle) notFound();

  const childRows = await db
    .select()
    .from(products)
    .where(inArray(products.id, bundle.product_ids));

  const sumEur = (bundle.sum_price_cents / 100).toFixed(2);
  const bundleEur = (bundle.bundle_price_cents / 100).toFixed(2);
  const savings = ((bundle.sum_price_cents - bundle.bundle_price_cents) / 100).toFixed(2);

  return (
    <main className="min-h-screen bg-background">
      <ShopHeader />

      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← All printables
          </Link>
        </div>
      </div>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Hero */}
        <div>
          {bundle.hero_image_url ? (
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted border border-border">
              <Image
                src={bundle.hero_image_url}
                alt={bundle.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                className="object-cover"
              />
            </div>
          ) : null}
        </div>

        {/* Detail */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Bundle · {bundle.product_ids.length}-pack
          </p>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
            {bundle.name}
          </h1>

          <div className="mt-5 flex items-baseline gap-3">
            <p className="text-3xl font-semibold text-foreground">€{bundleEur}</p>
            <p className="text-sm text-muted-foreground line-through">€{sumEur}</p>
            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
              Save €{savings} ({bundle.discount_percent}% off)
            </span>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-foreground">{bundle.description}</p>

          <form action="/api/shop/bundle-checkout" method="post" className="mt-8">
            <input type="hidden" name="slug" value={bundle.slug} />
            <button
              type="submit"
              className="w-full rounded-lg bg-foreground text-background hover:opacity-90 p-4 transition-opacity font-semibold"
            >
              Buy bundle — €{bundleEur}
            </button>
          </form>

          {/* What's included */}
          <div className="mt-10">
            <p className="text-xs font-semibold tracking-widest uppercase text-foreground mb-4">
              What's in this bundle ({childRows.length} printables)
            </p>
            <div className="space-y-3">
              {childRows.map((p) => (
                <Link
                  key={p.id}
                  href={`/${p.slug ?? ''}`}
                  className="flex gap-4 rounded-lg border border-border bg-card hover:border-foreground/20 p-4 transition-colors"
                >
                  {p.hero_image_url ? (
                    <div className="relative w-16 h-16 flex-shrink-0 overflow-hidden rounded bg-muted">
                      <Image
                        src={p.hero_image_url}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 flex-shrink-0 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground line-clamp-1">
                      {p.shop_title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      €{(p.price_cents / 100).toFixed(2)} · individually
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <StatementFooter />
    </main>
  );
}
