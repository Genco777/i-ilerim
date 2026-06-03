/**
 * Trust signal strip — instant delivery, secure payment, refund window.
 * Conversion-focused micro-copy in English (buyer-facing).
 */
export function TrustStrip() {
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs sm:text-sm">
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base">⚡</span>
          <div>
            <p className="font-semibold text-foreground">Instant download</p>
            <p className="text-muted-foreground">PDF in your inbox in &lt; 60 seconds</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base">🔒</span>
          <div>
            <p className="font-semibold text-foreground">Secure checkout</p>
            <p className="text-muted-foreground">Stripe · Card &amp; PayPal · SSL</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base">🇩🇪</span>
          <div>
            <p className="font-semibold text-foreground">German studio</p>
            <p className="text-muted-foreground">Designed in Karben, Frankfurt area</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <span aria-hidden className="text-base">✉️</span>
          <div>
            <p className="font-semibold text-foreground">Real human support</p>
            <p className="text-muted-foreground">Reply within 12h, weekends included</p>
          </div>
        </div>
      </div>
    </section>
  );
}
