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

export const dynamic = 'force-dynamic';

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

          <form action="/api/shop/checkout" method="post" className="mt-7">
            <input type="hidden" name="slug" value={product.slug ?? ''} />
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-8 py-4 text-base font-semibold tracking-tight hover:opacity-90 transition-opacity"
            >
              Buy now · €{priceEur}
            </button>
          </form>

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
