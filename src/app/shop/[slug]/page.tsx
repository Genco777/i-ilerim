/**
 * Product detail page — /[slug] on shop.fly-froth.com
 * (internally /shop/[slug] via middleware rewrite)
 */
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { StatementFooter } from '@/components/shop/StatementFooter';
import { TierSelector, type TierDef } from '@/components/shop/TierSelector';
import type { Product } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Sprint I — Resolve the 3-tier list for this product via the tier-pricing
 * module. Dynamic import so a runtime error (e.g. Stripe key misconfig at
 * import-time) never breaks the product page — we fall back to the legacy
 * single-button tier blocks below.
 */
async function resolveTiers(product: Product): Promise<TierDef[] | null> {
  try {
    const mod = await import('@/lib/shop/tier-pricing');
    if (typeof mod.computeTiersForProduct !== 'function') return null;
    const tiers = mod.computeTiersForProduct(product);
    return Array.isArray(tiers) && tiers.length > 0 ? (tiers as TierDef[]) : null;
  } catch {
    return null;
  }
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}

export default async function ProductDetail(props: PageProps) {
  const { slug } = await props.params;
  const { cancelled } = await props.searchParams;

  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.slug, slug),
        eq(products.is_public_in_shop, 1),
        or(eq(products.status, 'approved'), eq(products.status, 'published')),
      ),
    )
    .limit(1);
  const product = rows[0];
  if (!product) notFound();

  const gallery = [
    product.hero_image_url,
    ...((product.mockup_image_urls as string[] | null) ?? []),
  ].filter((u): u is string => !!u);

  const priceEur = (product.price_cents / 100).toFixed(2);
  const tiers = await resolveTiers(product);

  return (
    <main className="min-h-screen bg-background">
      <ShopHeader />

      {/* Breadcrumb */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            ← All printables
          </Link>
        </div>
      </div>

      {/* Hero grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Gallery */}
        <div>
          {gallery[0] ? (
            <div className="relative aspect-square overflow-hidden rounded-xl bg-muted border border-border">
              <Image
                src={gallery[0]}
                alt={product.shop_title ?? 'Product'}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                className="object-cover"
              />
            </div>
          ) : (
            <div className="aspect-square rounded-xl bg-muted border border-border" />
          )}
          {gallery.length > 1 ? (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {gallery.slice(1, 4).map((url, i) => (
                <div
                  key={i}
                  className="relative aspect-square overflow-hidden rounded-md bg-muted border border-border"
                >
                  <Image src={url} alt="" fill sizes="20vw" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Detail + Buy */}
        <div className="lg:pt-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {product.type.replace('_', ' ')} · printable PDF
          </p>
          <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">
            {product.shop_title}
          </h1>

          <div className="mt-5 flex items-baseline gap-3">
            <p className="text-3xl font-semibold text-foreground">€{priceEur}</p>
            <p className="text-xs text-muted-foreground">
              gem. §19 UStG keine USt · instant download
            </p>
          </div>

          {cancelled ? (
            <div className="mt-5 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
              Checkout cancelled — no payment was taken.
            </div>
          ) : null}

          {/* Sprint I — 3-tier selector (Basic / Pro / Editable). Falls back
              to the legacy B1 multi-form block if tier-pricing module is
              unavailable at build time. */}
          {tiers ? (
            <TierSelector
              productId={product.id}
              productSlug={product.slug ?? ''}
              productTitle={product.shop_title ?? 'Printable'}
              tiers={tiers}
            />
          ) : (
            <div className="mt-8 space-y-3">
              <form action="/api/shop/checkout" method="post">
                <input type="hidden" name="slug" value={product.slug ?? ''} />
                <input type="hidden" name="tier" value="basic" />
                <button
                  type="submit"
                  className="w-full text-left rounded-lg border border-border bg-card hover:border-foreground/20 p-5 transition-colors"
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Basic</p>
                      <p className="text-base font-semibold text-foreground">Printable PDF · instant download</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">€{priceEur}</p>
                  </div>
                </button>
              </form>
              {product.tier_b_price_cents && product.tier_b_description ? (
                <form action="/api/shop/checkout" method="post">
                  <input type="hidden" name="slug" value={product.slug ?? ''} />
                  <input type="hidden" name="tier" value="plus" />
                  <button
                    type="submit"
                    className="w-full text-left rounded-lg border-2 border-primary/40 bg-primary/5 hover:border-primary/60 p-5 transition-colors"
                  >
                    <div className="flex items-baseline justify-between mb-2">
                      <div>
                        <p className="text-xs uppercase tracking-widest text-primary mb-1">Plus · most popular</p>
                        <p className="text-base font-semibold text-foreground">PDF + editable Canva + 3 bonus pages</p>
                      </div>
                      <p className="text-2xl font-bold text-foreground">€{(product.tier_b_price_cents / 100).toFixed(2)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{product.tier_b_description}</p>
                  </button>
                </form>
              ) : null}
              {product.tier_c_price_cents && product.tier_c_description ? (
                <form action="/api/shop/checkout" method="post" className="rounded-lg border border-border bg-card p-5">
                  <input type="hidden" name="slug" value={product.slug ?? ''} />
                  <input type="hidden" name="tier" value="pro" />
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Pro · personalized</p>
                      <p className="text-base font-semibold text-foreground">Everything + personalized for you</p>
                    </div>
                    <p className="text-2xl font-bold text-foreground">€{(product.tier_c_price_cents / 100).toFixed(2)}</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4">{product.tier_c_description}</p>

                  {/* Sprint G — Personalization inputs (Pro only) */}
                  <div className="space-y-3 mt-4 mb-4 p-3 rounded bg-muted/40 border border-border/50">
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                      Personalize this download
                    </p>
                    <div>
                      <label htmlFor="custom_name" className="block text-xs text-foreground mb-1">
                        Name to print on cover
                      </label>
                      <input
                        id="custom_name"
                        type="text"
                        name="custom_name"
                        maxLength={40}
                        placeholder="e.g. Sarah"
                        className="w-full px-3 py-2 text-sm rounded border border-border bg-background"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="custom_date" className="block text-xs text-foreground mb-1">
                        Date (optional — e.g. wedding date, birthday)
                      </label>
                      <input
                        id="custom_date"
                        type="text"
                        name="custom_date"
                        maxLength={30}
                        placeholder="e.g. June 2026"
                        className="w-full px-3 py-2 text-sm rounded border border-border bg-background"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-lg bg-foreground text-background hover:opacity-90 p-3 transition-opacity font-semibold text-sm"
                  >
                    Order personalized — €{(product.tier_c_price_cents / 100).toFixed(2)}
                  </button>
                </form>
              ) : null}
            </div>
          )}

          {/* Reassurance row */}
          <ul className="mt-5 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span aria-hidden>✓</span> Stripe-secured payment
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden>✓</span> Card &amp; PayPal accepted
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden>✓</span> Email delivery in &lt; 60 s
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden>✓</span> Real human support (12 h)
            </li>
          </ul>

          {/* Description */}
          <div className="mt-8 prose prose-stone max-w-none">
            <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">
              {product.shop_description}
            </p>
          </div>

          {/* What you get */}
          <div className="mt-8 rounded-xl border border-border bg-muted/40 p-5">
            <p className="text-xs font-semibold tracking-widest uppercase text-foreground">
              What you get
            </p>
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2">
                <span aria-hidden className="text-muted-foreground">·</span>
                Printable A4 PDF · instant download after checkout
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="text-muted-foreground">·</span>
                Email with secure download link · 24 h, 5 downloads
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="text-muted-foreground">·</span>
                For personal use · re-print as many times as you like
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="text-muted-foreground">·</span>
                Lost the file? Reply to your order email — we resend within 12 h
              </li>
            </ul>
          </div>

          {/* Returns / digital goods note */}
          <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
            Because this is a digital download delivered immediately, the statutory
            14-day right of withdrawal does not apply once the file is sent (§356
            Abs. 5 BGB). If anything is wrong with the file, email{' '}
            <a href="mailto:info@fly-froth.com" className="underline text-foreground">
              info@fly-froth.com
            </a>{' '}
            and we&apos;ll make it right.
          </p>
        </div>
      </section>

      <StatementFooter />
    </main>
  );
}
