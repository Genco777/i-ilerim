import { getCustomer } from './client';
import { enums } from 'google-ads-api';
import type { KeywordSpec } from './types';

const MATCH_TYPE_MAP: Record<KeywordSpec['match_type'], number> = {
  BROAD: enums.KeywordMatchType.BROAD,
  PHRASE: enums.KeywordMatchType.PHRASE,
  EXACT: enums.KeywordMatchType.EXACT,
};

export async function createSearchAdGroupWithKeywords(args: {
  campaignResourceName: string;
  adGroupName: string;
  defaultBidCents: number;
  keywords: KeywordSpec[];
}): Promise<{ adGroupResourceName: string }> {
  const customer = await getCustomer();

  const adGroupResponse = await customer.adGroups.create([
    {
      name: args.adGroupName,
      campaign: args.campaignResourceName,
      type: enums.AdGroupType.SEARCH_STANDARD,
      status: enums.AdGroupStatus.PAUSED,
      cpc_bid_micros: args.defaultBidCents * 10_000, // cents → micros (1 EUR = 1_000_000 micros)
    } as unknown as Parameters<typeof customer.adGroups.create>[0][number],
  ]);

  const adGroupResourceName = (
    adGroupResponse as unknown as { results?: { resource_name?: string }[] }
  ).results?.[0]?.resource_name;
  if (!adGroupResourceName) throw new Error('adGroups.create returned no resource_name');

  if (args.keywords.length > 0) {
    await customer.adGroupCriteria.create(
      args.keywords.map((kw) => ({
        ad_group: adGroupResourceName,
        status: enums.AdGroupCriterionStatus.ENABLED,
        keyword: {
          text: kw.keyword,
          match_type: MATCH_TYPE_MAP[kw.match_type],
        },
      })) as unknown as Parameters<typeof customer.adGroupCriteria.create>[0],
    );
  }

  return { adGroupResourceName };
}

export async function createResponsiveSearchAd(args: {
  adGroupResourceName: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
}): Promise<{ adResourceName: string }> {
  const customer = await getCustomer();
  const adResponse = await customer.adGroupAds.create([
    {
      ad_group: args.adGroupResourceName,
      status: enums.AdGroupAdStatus.ENABLED,
      ad: {
        final_urls: [args.finalUrl],
        responsive_search_ad: {
          headlines: args.headlines.map((t) => ({ text: t })),
          descriptions: args.descriptions.map((t) => ({ text: t })),
        },
      },
    } as unknown as Parameters<typeof customer.adGroupAds.create>[0][number],
  ]);
  const adResourceName = (
    adResponse as unknown as { results?: { resource_name?: string }[] }
  ).results?.[0]?.resource_name;
  if (!adResourceName) throw new Error('adGroupAds.create returned no resource_name');
  return { adResourceName };
}
