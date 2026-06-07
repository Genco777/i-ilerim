/**
 * Sprint I — Shop product detail tier selector (Basic / Pro / Editable).
 *
 * 3-tier radio-card picker with inline personalization form (Pro)
 * and Canva-editable preview note (Editable). Submits to /api/shop/checkout
 * via a hidden form so the existing 303 → Stripe redirect contract is
 * preserved (cross-origin fetch + manual redirect would break CORS).
 *
 * Premium-vizyon brand: indigo accent, editorial micro-typography, NO blur.
 */
'use client';

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { trackBeginCheckout } from '@/lib/analytics/providers';

// Re-declared locally so this component can be imported without a hard
// dependency on '@/lib/shop/tier-pricing' (built by parallel agent #3).
// Shape MUST stay in sync with that module's exported TierDef.
export type TierKey = 'basic' | 'pro' | 'editable';

export interface TierDef {
  key: TierKey;
  label: string;
  shortDescription: string;
  bulletPoints: string[];
  priceCents: number;
  stripePriceId: string | null;
  available: boolean;
  assetUrl: string | null;
  highlight?: boolean;
}

export interface TierSelectorProps {
  productId: string;
  productSlug: string;
  productTitle: string;
  tiers: TierDef[];
  checkoutEndpoint?: string;
}

const TIER_TO_API: Record<TierKey, 'basic' | 'plus' | 'pro'> = {
  // The current /api/shop/checkout route knows about 'basic' | 'plus' | 'pro'.
  // We map Sprint I's new 'editable' to the existing 'pro' Stripe slot
  // (per tier-pricing module: editable replaces the old Pro slot — same price col).
  basic: 'basic',
  pro: 'plus',
  editable: 'pro',
};

const NAME_MAX = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function TierSelector(props: TierSelectorProps) {
  const {
    productId,
    productSlug,
    productTitle,
    tiers,
    checkoutEndpoint = '/api/shop/checkout',
  } = props;

  // Pick a sensible initial selection: first highlighted available tier,
  // else first available tier, else first tier (will render disabled).
  const initialKey = useMemo<TierKey>(() => {
    const highlighted = tiers.find((t) => t.highlight && t.available);
    if (highlighted) return highlighted.key;
    const firstAvail = tiers.find((t) => t.available);
    if (firstAvail) return firstAvail.key;
    return tiers[0]?.key ?? 'basic';
  }, [tiers]);

  const [selected, setSelected] = useState<TierKey>(initialKey);
  const [customName, setCustomName] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const groupName = useId();

  const selectedTier = tiers.find((t) => t.key === selected);
  const requiresPersonalization = selected === 'pro';

  const onSelect = useCallback((key: TierKey, available: boolean) => {
    if (!available) return;
    setSelected(key);
    setError(null);
  }, []);

  const onKeyboardNav = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Arrow-key navigation across radio cards (a11y radiogroup pattern).
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') {
        return;
      }
      e.preventDefault();
      const availables = tiers.filter((t) => t.available);
      if (availables.length === 0) return;
      const idx = availables.findIndex((t) => t.key === selected);
      const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const next = availables[(idx + dir + availables.length) % availables.length];
      if (next) setSelected(next.key);
    },
    [tiers, selected],
  );

  const validate = useCallback((): string | null => {
    if (!selectedTier) return 'Please pick a tier.';
    if (!selectedTier.available) return 'This tier is not yet available.';
    if (requiresPersonalization) {
      const n = customName.trim();
      if (!n) return 'Please enter the name to print on the cover.';
      if (n.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;
      if (customDate.trim() && !DATE_RE.test(customDate.trim())) {
        return 'Date must be in YYYY-MM-DD format (e.g. 2026-06-21).';
      }
    }
    return null;
  }, [selectedTier, requiresPersonalization, customName, customDate]);

  const onSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      const v = validate();
      if (v) {
        e.preventDefault();
        setError(v);
        return;
      }
      if (!selectedTier) {
        e.preventDefault();
        setError('Please pick a tier.');
        return;
      }
      // Fire analytics before native form-submit kicks the page off to /api → 303 → Stripe.
      try {
        trackBeginCheckout({
          id: productId,
          name: productTitle,
          price: selectedTier.priceCents / 100,
          currency: 'EUR',
        });
      } catch {
        /* analytics never blocks checkout */
      }
      setError(null);
      setLoading(true);
      // Browser will now POST the form, follow the 303, and land on Stripe.
      // If something on the server-side rejects (4xx/5xx), the browser navigates
      // to /api/shop/checkout and we lose the loader. That's acceptable — the
      // server returns a JSON error page in that rare case.
    },
    [validate, selectedTier, productId, productTitle],
  );

  // Edge case: no tiers at all → render nothing (Server page falls back to legacy button).
  if (tiers.length === 0) return null;

  return (
    <div className="mt-8">
      <form
        ref={formRef}
        action={checkoutEndpoint}
        method="post"
        onSubmit={onSubmit}
        noValidate
      >
        <input type="hidden" name="slug" value={productSlug} />
        <input type="hidden" name="tier" value={TIER_TO_API[selected]} />
        {requiresPersonalization ? (
          <>
            <input type="hidden" name="custom_name" value={customName.trim()} />
            <input type="hidden" name="custom_date" value={customDate.trim()} />
          </>
        ) : null}

        <div
          role="radiogroup"
          aria-label="Choose a tier"
          onKeyDown={onKeyboardNav}
          className="space-y-3"
        >
          {tiers.map((tier) => {
            const isSelected = tier.key === selected;
            const isDisabled = !tier.available;
            const baseClasses =
              'relative w-full text-left rounded-lg p-5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';
            const stateClasses = isDisabled
              ? 'border border-border bg-card opacity-50 cursor-not-allowed'
              : isSelected
                ? tier.highlight
                  ? 'border-2 border-primary bg-primary/5 cursor-pointer'
                  : 'border-2 border-primary bg-card cursor-pointer'
                : tier.highlight
                  ? 'border-2 border-primary/40 bg-primary/5 hover:border-primary/60 cursor-pointer'
                  : 'border border-border bg-card hover:border-foreground/30 cursor-pointer';

            return (
              <button
                key={tier.key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={isDisabled}
                disabled={isDisabled}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelect(tier.key, tier.available)}
                className={`${baseClasses} ${stateClasses}`}
              >
                {/* Badges */}
                <div className="absolute right-4 top-4 flex items-center gap-2">
                  {tier.highlight && tier.available ? (
                    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
                      Recommended
                    </span>
                  ) : null}
                  {!tier.available ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Coming soon
                    </span>
                  ) : null}
                </div>

                {/* Hidden native radio for screen readers + form fallback */}
                <input
                  type="radio"
                  name={groupName}
                  value={tier.key}
                  checked={isSelected}
                  onChange={() => onSelect(tier.key, tier.available)}
                  disabled={isDisabled}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />

                <div className="flex items-start justify-between gap-4 pr-24">
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-[11px] uppercase tracking-[0.18em] mb-1 ${
                        tier.highlight ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {tier.label}
                    </p>
                    <p className="text-sm sm:text-base font-semibold text-foreground leading-snug">
                      {tier.shortDescription}
                    </p>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-foreground whitespace-nowrap shrink-0">
                    €{formatEuro(tier.priceCents)}
                  </p>
                </div>

                {tier.bulletPoints.length > 0 ? (
                  <ul className="mt-3 space-y-1.5">
                    {tier.bulletPoints.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-foreground">
                        <span
                          aria-hidden
                          className={
                            tier.highlight ? 'text-primary mt-0.5' : 'text-muted-foreground mt-0.5'
                          }
                        >
                          ✓
                        </span>
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Pro tier — personalization inputs */}
        {requiresPersonalization && selectedTier?.available ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Personalize this download
            </p>
            <div>
              <label htmlFor={`${groupName}-name`} className="block text-xs font-medium text-foreground mb-1">
                Name to print on cover <span className="text-muted-foreground">(required)</span>
              </label>
              <input
                id={`${groupName}-name`}
                type="text"
                inputMode="text"
                maxLength={NAME_MAX}
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. Sarah"
                className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                required
                aria-required="true"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {customName.length}/{NAME_MAX} characters
              </p>
            </div>
            <div>
              <label htmlFor={`${groupName}-date`} className="block text-xs font-medium text-foreground mb-1">
                Date <span className="text-muted-foreground">(optional, YYYY-MM-DD)</span>
              </label>
              <input
                id={`${groupName}-date`}
                type="text"
                inputMode="numeric"
                pattern="\d{4}-\d{2}-\d{2}"
                maxLength={10}
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="2026-06-21"
                className="w-full px-3 py-2 text-sm rounded border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        ) : null}

        {/* Editable tier — Canva note */}
        {selected === 'editable' && selectedTier?.available ? (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary mb-1">
              Editable in Canva
            </p>
            <p className="text-xs sm:text-sm text-foreground leading-relaxed">
              After checkout you&apos;ll get a printable PDF{' '}
              <strong className="font-semibold">plus</strong> a Canva
              &ldquo;use as template&rdquo; link so you can change colours, photos and
              text in your browser. Step-by-step instructions PDF included.
            </p>
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || !selectedTier?.available}
          className="mt-5 w-full rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3.5 font-semibold text-sm sm:text-base transition-opacity flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <span>Redirecting to checkout…</span>
            </>
          ) : (
            <>
              Buy now — €{formatEuro(selectedTier?.priceCents ?? 0)}
            </>
          )}
        </button>

        <p className="mt-3 text-[11px] text-muted-foreground text-center leading-relaxed">
          Stripe-secured · Card &amp; PayPal · instant email delivery
        </p>
      </form>

      {/* Comparison table (md+ only) */}
      <TierComparisonTable tiers={tiers} selected={selected} />
    </div>
  );
}

// ── Comparison table ────────────────────────────────────────────────────────

function TierComparisonTable({ tiers, selected }: { tiers: TierDef[]; selected: TierKey }) {
  const features = useMemo(() => buildFeatureMatrix(tiers), [tiers]);

  if (features.length === 0) return null;

  return (
    <div className="mt-8 hidden md:block">
      <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mb-3">
        Compare tiers
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="text-left px-4 py-3 font-semibold text-foreground">
                Feature
              </th>
              {tiers.map((t) => (
                <th
                  key={t.key}
                  scope="col"
                  className={`text-center px-4 py-3 font-semibold ${
                    t.key === selected ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  {t.label}
                  <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                    €{formatEuro(t.priceCents)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f, i) => (
              <tr key={f.label} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                <th
                  scope="row"
                  className="text-left px-4 py-3 font-normal text-foreground"
                >
                  {f.label}
                </th>
                {tiers.map((t) => (
                  <td
                    key={t.key}
                    className={`text-center px-4 py-3 ${
                      t.key === selected ? 'text-primary font-semibold' : 'text-foreground'
                    }`}
                  >
                    {f.tiers[t.key] ? (
                      <span aria-label="included">✓</span>
                    ) : (
                      <span aria-label="not included" className="text-muted-foreground">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FeatureRow {
  label: string;
  tiers: Record<TierKey, boolean>;
}

/**
 * Builds the comparison-matrix rows from each tier's bulletPoints. Bullets
 * that appear verbatim across multiple tiers map to a single row with checks
 * on those tiers. Bullets unique to one tier still get their own row.
 *
 * Always prepends a synthetic "Price" / "Instant download" baseline so the
 * table never looks empty.
 */
function buildFeatureMatrix(tiers: TierDef[]): FeatureRow[] {
  const keys = tiers.map((t) => t.key);
  const emptyRow = (): Record<TierKey, boolean> =>
    keys.reduce<Record<TierKey, boolean>>((acc, k) => {
      acc[k] = false;
      return acc;
    }, { basic: false, pro: false, editable: false });

  const rows = new Map<string, FeatureRow>();

  // Baseline universal row — every tier delivers a PDF
  const baseline: FeatureRow = { label: 'Printable PDF · instant download', tiers: emptyRow() };
  for (const t of tiers) if (t.available) baseline.tiers[t.key] = true;
  rows.set(baseline.label.toLowerCase(), baseline);

  for (const tier of tiers) {
    for (const raw of tier.bulletPoints) {
      const label = raw.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      let row = rows.get(key);
      if (!row) {
        row = { label, tiers: emptyRow() };
        rows.set(key, row);
      }
      row.tiers[tier.key] = true;
    }
  }

  return Array.from(rows.values()).slice(0, 8); // cap visual length
}
