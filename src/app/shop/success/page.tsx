/**
 * Post-checkout success — /success?session_id=cs_... on shop.fly-froth.com
 */
import Link from 'next/link';
import { getStripe } from '@/lib/stripe/client';
import { ShopHeader } from '@/components/shop/ShopHeader';
import { StatementFooter } from '@/components/shop/StatementFooter';
import { PurchaseTracker } from '@/components/shop/PurchaseTracker';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function SuccessPage(props: PageProps) {
  const { session_id } = await props.searchParams;
  let buyerEmail:       string | null = null;
  let productName:      string | null = null;
  let purchaseValue:    number       = 0;
  let purchaseCurrency: string       = 'EUR';
  let productId:        string | null = null;

  if (session_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['line_items'],
      });
      buyerEmail       = session.customer_details?.email ?? null;
      productName      = session.line_items?.data[0]?.description ?? null;
      purchaseValue    = (session.amount_total ?? 0) / 100;
      purchaseCurrency = (session.currency ?? 'eur').toUpperCase();
      productId        = (session.metadata?.trend_product_id as string) ?? null;
    } catch {
      /* silent */
    }
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Analytics: Purchase event (client-side, deduped w/ server-side via session_id) */}
      {session_id && purchaseValue > 0 ? (
        <PurchaseTracker
          sessionId={session_id}
          value={purchaseValue}
          currency={purchaseCurrency}
          productId={productId ?? undefined}
          productName={productName ?? undefined}
        />
      ) : null}
      <ShopHeader />

      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <p className="text-xs tracking-[0.22em] uppercase text-muted-foreground">
          Payment received
        </p>
        <h1 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
          Thanks — your download is on its way.
        </h1>

        {productName ? (
          <p className="mt-5 text-base text-foreground">
            <span className="font-medium">{productName}</span>
          </p>
        ) : null}

        <div className="mt-10 rounded-xl border border-border bg-card p-6 text-left text-sm text-foreground leading-relaxed">
          <p>
            We&apos;ve emailed the secure download link to{' '}
            <span className="font-semibold">{buyerEmail ?? 'your email address'}</span>.
          </p>
          <p className="mt-3 text-muted-foreground">
            The link works for 24 hours and up to 5 downloads. Not in your inbox in a few minutes?
            Check spam, or reply to the order email — we resend within 12 hours, weekends included.
          </p>
        </div>

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Keep browsing
          </Link>
          <a
            href="mailto:info@fly-froth.com"
            className="inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-6 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Email support
          </a>
        </div>
      </section>

      <StatementFooter />
    </main>
  );
}
