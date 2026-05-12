import { getCustomer } from './client';
import { enums } from 'google-ads-api';
import { checkBudget } from './budget-guard';
import {
  createSearchAdGroupWithKeywords,
  createResponsiveSearchAd,
} from './ad-groups';
import {
  createCampaignRow,
  updateCampaignRow,
  getCampaign,
  type AdsCampaign,
} from '@/lib/db/queries/ads-campaigns';
import type { CampaignDraft, CreateCampaignResult } from './types';

function parseGoogleId(resourceName: string): string {
  const parts = resourceName.split('/');
  return parts[parts.length - 1]!;
}

async function createBudgetResource(name: string, dailyCents: number): Promise<string> {
  const customer = await getCustomer();
  const response = await customer.campaignBudgets.create([
    {
      name,
      amount_micros: dailyCents * 10_000,
      delivery_method: enums.BudgetDeliveryMethod.STANDARD,
      explicitly_shared: false,
    } as unknown as Parameters<typeof customer.campaignBudgets.create>[0][number],
  ]);
  const resourceName = (
    response as unknown as { results?: { resource_name?: string }[] }
  ).results?.[0]?.resource_name;
  if (!resourceName) throw new Error('campaignBudgets.create returned no resource_name');
  return resourceName;
}

export async function createSearchCampaign(
  draft: CampaignDraft,
  telegramChatId: number,
): Promise<CreateCampaignResult> {
  if (draft.type !== 'search') {
    throw new Error(`createSearchCampaign called with non-search type: ${draft.type}`);
  }

  const guard = await checkBudget(draft);
  if (!guard.ok) {
    throw new Error(`Budget guard rejected: ${guard.reason} — ${guard.message}`);
  }

  const customer = await getCustomer();

  // 1. Insert DB row first (status=paused) so we can rollback in mirror
  const row = await createCampaignRow({
    google_campaign_id: null,
    name: draft.name,
    type: 'search',
    status: 'paused',
    daily_budget_cents: draft.daily_budget_cents,
    target_url: draft.target_url,
    conversion_action: draft.conversion_action,
    start_date: draft.start_date,
    end_date: draft.end_date,
    created_via: 'telegram',
    telegram_chat_id: telegramChatId,
  });

  try {
    // 2. Create budget
    const budgetResourceName = await createBudgetResource(
      `${draft.name} - Budget`,
      draft.daily_budget_cents,
    );

    // 3. Create campaign (paused on creation, Mehmet enables explicitly)
    const campaignResponse = await customer.campaigns.create([
      {
        name: draft.name,
        advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
        status: enums.CampaignStatus.PAUSED,
        manual_cpc: { enhanced_cpc_enabled: false },
        campaign_budget: budgetResourceName,
        start_date: draft.start_date.replace(/-/g, ''),
        end_date: draft.end_date ? draft.end_date.replace(/-/g, '') : undefined,
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: false,
          target_partner_search_network: false,
        },
        geo_target_type_setting: {
          positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE_OR_INTEREST,
          negative_geo_target_type: enums.NegativeGeoTargetType.PRESENCE,
        },
      } as unknown as Parameters<typeof customer.campaigns.create>[0][number],
    ]);
    const campaignResourceName = (
      campaignResponse as unknown as { results?: { resource_name?: string }[] }
    ).results?.[0]?.resource_name;
    if (!campaignResourceName) throw new Error('campaigns.create returned no resource_name');
    const googleCampaignId = parseGoogleId(campaignResourceName);

    // 4. Geo-target (Germany default)
    await customer.campaignCriteria.create([
      {
        campaign: campaignResourceName,
        location: { geo_target_constant: `geoTargetConstants/${draft.location_id}` },
      } as unknown as Parameters<typeof customer.campaignCriteria.create>[0][number],
    ]);

    // 5. Ad group + keywords (default bid: half of daily budget per click as a safe upper bound)
    const defaultBidCents = Math.max(20, Math.floor(draft.daily_budget_cents / 10));
    const { adGroupResourceName } = await createSearchAdGroupWithKeywords({
      campaignResourceName,
      adGroupName: `${draft.name} - Ad Group`,
      defaultBidCents,
      keywords: draft.keywords,
    });

    // 6. Responsive search ad
    const { adResourceName } = await createResponsiveSearchAd({
      adGroupResourceName,
      finalUrl: draft.target_url,
      headlines: draft.headlines,
      descriptions: draft.descriptions,
    });

    // 7. Update mirror row
    await updateCampaignRow(row.id, { google_campaign_id: googleCampaignId });

    return {
      google_campaign_id: googleCampaignId,
      google_ad_group_id: parseGoogleId(adGroupResourceName),
      google_ad_id: parseGoogleId(adResourceName),
    };
  } catch (err) {
    // Best-effort: mark mirror row as removed so it doesn't appear in /ads list
    await updateCampaignRow(row.id, { status: 'removed' });
    throw err;
  }
}

async function setCampaignStatus(
  campaignId: string,
  googleStatus: number,
  mirrorStatus: 'enabled' | 'paused' | 'removed',
): Promise<AdsCampaign> {
  const row = await getCampaign(campaignId);
  if (!row) throw new Error(`Campaign ${campaignId} not in DB`);
  if (!row.google_campaign_id) throw new Error('Campaign has no google_campaign_id yet');

  const customer = await getCustomer();
  await customer.campaigns.update([
    {
      resource_name: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${row.google_campaign_id}`,
      status: googleStatus,
    } as unknown as Parameters<typeof customer.campaigns.update>[0][number],
  ]);

  return updateCampaignRow(campaignId, { status: mirrorStatus });
}

export async function pauseCampaign(campaignId: string): Promise<AdsCampaign> {
  return setCampaignStatus(campaignId, enums.CampaignStatus.PAUSED, 'paused');
}

export async function resumeCampaign(campaignId: string): Promise<AdsCampaign> {
  return setCampaignStatus(campaignId, enums.CampaignStatus.ENABLED, 'enabled');
}
