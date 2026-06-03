/**
 * Product detail page — /shop/[slug]
 *
 * Server component. Shows hero + gallery (mockups), title, description,
 * price, and a "Buy now" form that POSTs to /api/shop/checkout to create
 * a Stripe Checkout session and redirect to it.
 */
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
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

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Link href="/shop" className="text-sm text-stone-500 hover:text-stone-900">
            ← Shop
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-12 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          {gallery[0] ? (
            <div className="relative aspect-square overflow-hidden rounded-lg bg-stone-100">
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
            <div className="aspect-square rounded-lg bg-stone-200" />
          )}
          {gallery.length > 1 ? (
            <div className="mt-3 grid grid-cols-3 gap-3">
              {gallery.slice(1, 4).map((url, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-md bg-stone-100">
                  <Image src={url} alt="" fill sizes="20vw" className="object-cover" />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Details + Buy */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            {product.shop_title}
          </h1>
          <p className="mt-3 text-3xl font-light text-stone-900">
            €{(product.price_cents / 100).toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Inkl. ges. Steuern · Instant download · {product.type.replace('_', ' ')}
          </p>

          {cancelled ? (
            <div className="mt-4 rounded border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700">
              Checkout cancelled — no payment was taken.
            </div>
          ) : null}

          <form action="/api/shop/checkout" method="post" className="mt-6">
            <input type="hidden" name="slug" value={product.slug ?? ''} />
            <button
              type="submit"
              className="w-full rounded bg-stone-900 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-stone-800"
            >
              Buy now · €{(product.price_cents / 100).toFixed(2)}
            </button>
          </form>

          <div className="mt-8 space-y-4 text-sm leading-relaxed text-stone-700">
            <p className="whitespace-pre-line">{product.shop_description}</p>
          </div>

          <div className="mt-8 rounded border border-stone-200 bg-white p-4 text-xs leading-relaxed text-stone-600">
            <p className="font-semibold text-stone-800">What you get</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Printable A4 PDF · instant download after checkout</li>
              <li>Email with secure download link (24 h, 5 downloads)</li>
              <li>For personal use</li>
            </ul>
          </div>
        </div>
      </section>

      <StatementFooter />
    </main>
  );
}
