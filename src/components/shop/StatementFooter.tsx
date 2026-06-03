/**
 * Kleinunternehmer §19 + Impressum / DSGVO footer.
 * Required on every shop-facing page.
 */
import Link from 'next/link';

export function StatementFooter() {
  return (
    <footer className="mt-16 border-t border-stone-200 pt-8 pb-12 text-xs leading-relaxed text-stone-500">
      <div className="mx-auto max-w-3xl px-6">
        <p>
          <strong className="text-stone-700">Fly &amp; Froth</strong> · Karben, Germany ·{' '}
          <a href="mailto:info@fly-froth.com" className="underline">
            info@fly-froth.com
          </a>
        </p>
        <p className="mt-2">
          Gemäß §19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.
        </p>
        <p className="mt-2">
          Widerrufsrecht erlischt bei sofortiger Bereitstellung digitaler Inhalte mit
          ausdrücklicher Zustimmung des Kunden gemäß §356 Abs. 5 BGB.
        </p>
        <p className="mt-4">
          <Link href="/impressum" className="underline">
            Impressum
          </Link>
          {' · '}
          <Link href="/datenschutz" className="underline">
            Datenschutz
          </Link>
          {' · '}
          <Link href="/agb" className="underline">
            AGB
          </Link>
          {' · '}
          <Link href="/shop" className="underline">
            Shop
          </Link>
        </p>
      </div>
    </footer>
  );
}
