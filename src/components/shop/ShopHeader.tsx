/**
 * Top navigation bar for the shop subdomain — matches fly-froth.com
 * branding (logo, navy/steel-blue palette, magazine typography).
 */
import Link from 'next/link';
import Image from 'next/image';

export function ShopHeader() {
  return (
    <header className="border-b border-border bg-card sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3" aria-label="Fly & Froth">
          <Image
            src="/branding/logo-navy.png"
            alt="Fly & Froth"
            width={120}
            height={36}
            priority
            className="h-7 w-auto"
          />
          <span className="hidden sm:inline text-xs tracking-[0.18em] text-muted-foreground uppercase">
            Printable Studio
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-foreground hover:text-muted-foreground transition-colors">
            Shop
          </Link>
          <a
            href="https://www.fly-froth.com"
            className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors"
          >
            About the studio
          </a>
          <a
            href="mailto:info@fly-froth.com"
            className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors"
          >
            Contact
          </a>
        </nav>
      </div>
    </header>
  );
}
