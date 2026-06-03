/**
 * Kleinunternehmer §19 + Impressum / DSGVO / AGB footer.
 * Required legal block on every shop-facing page.
 */
import Link from 'next/link';
import Image from 'next/image';

export function StatementFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-card">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src="/branding/logo-navy.png"
                alt="Fly & Froth"
                width={120}
                height={36}
                className="h-7 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Editorial printable PDFs designed in a small German studio.
              Each download is hand-crafted by Mehmet Genco — no AI-generated
              fluff, no licence resellers, no template factories.
            </p>
            <address className="not-italic mt-6 text-xs text-muted-foreground leading-relaxed">
              Fly &amp; Froth · Mehmet Genco<br />
              Röderweg 19, 61184 Karben<br />
              Germany · Frankfurt am Main region<br />
              <a href="mailto:info@fly-froth.com" className="underline hover:text-foreground">
                info@fly-froth.com
              </a>
              {' · '}
              <a href="tel:+491631474127" className="underline hover:text-foreground">
                +49 163 1474127
              </a>
            </address>
          </div>

          {/* Shop links */}
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-foreground">
              Shop
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  All printables
                </Link>
              </li>
              <li>
                <a
                  href="https://www.fly-froth.com"
                  className="hover:text-foreground transition-colors"
                >
                  Design studio
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@fly-froth.com"
                  className="hover:text-foreground transition-colors"
                >
                  Custom request
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-foreground">
              Legal
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/impressum" className="hover:text-foreground transition-colors">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="hover:text-foreground transition-colors">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="/agb" className="hover:text-foreground transition-colors">
                  AGB &amp; Widerruf
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground leading-relaxed space-y-2">
          <p>
            Gemäß §19 UStG enthält der Rechnungsbetrag keine Umsatzsteuer.
          </p>
          <p>
            Widerrufsrecht erlischt bei sofortiger Bereitstellung digitaler Inhalte mit
            ausdrücklicher Zustimmung des Kunden gemäß §356 Abs. 5 BGB.
          </p>
          <p className="pt-2">© {new Date().getFullYear()} Fly &amp; Froth · All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
