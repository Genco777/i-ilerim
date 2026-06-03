/**
 * Post-checkout success page — /shop/success?session_id=cs_...
 *
 * Fetches the session from Stripe to confirm the buyer just paid, then
 * shows a thank-you with email-delivery note. The webhook independently
 * issues the download token + sends the email; this page is just human UX.
 */
import Link from 'next/link';
import { getStripe } from '@/lib/stripe/client';
import { StatementFooter } from '@/components/shop/StatementFooter';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function SuccessPage(props: PageProps) {
  const { session_id } = await props.searchParams;
  let buyerEmail: string | null = null;
  let productName: string | null = null;

  if (session_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(session_id, {
        expand: ['line_items'],
      });
      buyerEmail = session.customer_details?.email ?? null;
      productName = session.line_items?.data[0]?.description ?? null;
    } catch {
      // Session not found or invalid — still render a friendly thank-you
    }
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <Link href="/shop" className="text-sm text-stone-500 hover:text-stone-900">
            ← Shop
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-6 py-20 text-center">
        <p className="text-sm uppercase tracking-widest text-stone-500">Payment received</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">
          Thanks — your download is on its way.
        </h1>

        {productName ? (
          <p className="mt-4 text-stone-700">
            <span className="font-medium">{productName}</span>
          </p>
        ) : null}

        <div className="mt-10 space-y-4 text-sm leading-relaxed text-stone-700">
          <p>
            We sent the download link to{' '}
            <span className="font-medium text-stone-900">
              {buyerEmail ?? 'your email address'}
            </span>
            . It works for 24 hours and up to 5 downloads.
          </p>
          <p>
            Not in your inbox in a few minutes? Check spam, or reply to the order email
            and we will resend.
          </p>
        </div>

        <Link
          href="/shop"
          className="mt-12 inline-block rounded border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-stone-900 hover:bg-stone-50"
        >
          Keep browsing
        </Link>
      </section>

      <StatementFooter />
    </main>
  );
}
