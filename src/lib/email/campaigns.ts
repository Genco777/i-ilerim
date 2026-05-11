import { sendEmail, createCampaign, sendCampaignNow } from './brevo';
import { portfolioNewsletter, localOutreachEmail, reactivationEmail, weeklyDigest } from './templates';
import type { PortfolioItem, LocalOutreachOpts, DigestItem } from './templates';
import type { ContentSlot } from '@/types';

// ── Campaign tied to weekly plan ──

interface PlanCampaign {
  planId: string;
  week: number;
  year: number;
  status: 'draft' | 'sent' | 'failed';
  emailCount: number;
}

const planCampaigns = new Map<string, PlanCampaign>();

/**
 * Generate a portfolio newsletter from the weekly plan slots.
 * Picks vitrine + reel slots as portfolio items.
 */
export function slotsToPortfolioItems(slots: ContentSlot[]): PortfolioItem[] {
  const vitrineSlots = slots.filter(
    (s) => s.pillar === 'vitrine' || s.pillar === 'reel',
  );

  return vitrineSlots.slice(0, 6).map((s) => {
    const serviceMap: Record<string, string> = {
      webdesign: 'Webdesign',
      logodesign: 'Logodesign',
      flyerdesign: 'Flyerdesign',
      druckdesign: 'Druckdesign',
      branding: 'Branding',
      website: 'Webdesign',
      logo: 'Logodesign',
      flyer: 'Flyerdesign',
    };

    let serviceType = 'Design Service';
    const topic = (s.topic ?? '').toLowerCase();
    for (const [key, label] of Object.entries(serviceMap)) {
      if (topic.includes(key)) {
        serviceType = label;
        break;
      }
    }
    if (s.pillar === 'reel') serviceType = 'Video';

    return {
      headline: s.topic ?? 'Neues Projekt',
      description: `Ein Blick hinter die Kulissen unseres Design-Prozesses — direkt aus Karben, Rhein-Main. Faire Preise, Express-Option.`,
      cta: s.pillar === 'reel' ? 'Reel ansehen' : 'Projekt ansehen',
      serviceType,
    };
  });
}

/**
 * Send portfolio newsletter to a contact list.
 */
export async function sendPortfolioNewsletter(
  listIds: number[],
  items: PortfolioItem[],
  week: number,
  year: number,
) {
  const html = portfolioNewsletter(items);
  const subject = `Neue Design-Projekte | KW${week} — Fly & Froth Studio Update`;

  const campaign = await createCampaign({
    name: `KW${week}-${year} Portfolio Update`,
    subject,
    htmlContent: html,
    listIds,
  });

  await sendCampaignNow(campaign.id);
  return campaign;
}

/**
 * Send local business outreach email for a specific city.
 */
export async function sendLocalOutreach(
  recipients: { email: string; name?: string }[],
  opts: LocalOutreachOpts,
) {
  const html = localOutreachEmail(opts);
  const subject = `${opts.headline} — Fly & Froth aus Karben`;

  return sendEmail({
    to: recipients,
    subject,
    htmlContent: html,
    tags: ['local-outreach', opts.city.toLowerCase()],
  });
}

/**
 * Send reactivation email to a past client.
 */
export async function sendReactivation(
  email: string,
  clientName: string,
  lastProject: string,
) {
  const html = reactivationEmail(clientName, lastProject);
  const subject = `${clientName}, lass uns wieder zusammenarbeiten — Fly & Froth`;

  return sendEmail({
    to: [{ email, name: clientName }],
    subject,
    htmlContent: html,
    tags: ['reactivation'],
  });
}

/**
 * Send weekly digest of all plan content.
 */
export async function sendWeeklyDigest(
  listIds: number[],
  items: DigestItem[],
  week: number,
  year: number,
) {
  const html = weeklyDigest(items, week, year);
  const subject = `Dein Weekly Digest | KW${week} — Fly & Froth`;

  const campaign = await createCampaign({
    name: `KW${week}-${year} Weekly Digest`,
    subject,
    htmlContent: html,
    listIds,
  });

  await sendCampaignNow(campaign.id);
  return campaign;
}

/**
 * Full weekly email package: digest + portfolio showcase.
 * Call after weekly plan is approved.
 */
export async function runWeeklyEmailCampaign(
  listIds: number[],
  slots: ContentSlot[],
  week: number,
  year: number,
): Promise<{ digestId?: number; portfolioId?: number; error?: string }> {
  try {
    // 1. Weekly digest (all slots)
    const digestItems: DigestItem[] = slots.map((s) => ({
      topic: s.topic ?? '',
      pillar: s.pillar,
      channel: s.channel,
    }));
    const digest = await sendWeeklyDigest(listIds, digestItems, week, year);

    // 2. Portfolio newsletter (vitrine + reel only)
    const portfolioItems = slotsToPortfolioItems(slots);
    let portfolio: { id: number } | undefined;
    if (portfolioItems.length > 0) {
      portfolio = await sendPortfolioNewsletter(listIds, portfolioItems, week, year);
    }

    return {
      digestId: digest.id,
      portfolioId: portfolio?.id,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Targeted outreach to one of the 19 Rhein-Main cities.
 * Best used when the weekly plan features that city's pillar.
 */
export async function runCityOutreach(
  city: string,
  recipients: { email: string; name?: string }[],
  service: string,
) {
  const headline = service === 'Webdesign'
    ? `Professionelles Webdesign für ${city}`
    : service === 'Logodesign'
      ? `Ein neues Logo für dein Business in ${city}`
      : service === 'Flyerdesign'
        ? `Flyer & Druck für ${city}`
        : `Grafikdesign für ${city}`;

  return sendLocalOutreach(recipients, {
    city,
    service,
    headline,
    usp: `Lokales Design-Studio mit über 850 Projekten — persönlich, fair, schnell`,
  });
}
