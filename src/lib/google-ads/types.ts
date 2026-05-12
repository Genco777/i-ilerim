import type {
  AdsCampaignType,
  AdsCampaignStatus,
} from '@/lib/db/queries/ads-campaigns';

export type { AdsCampaignType, AdsCampaignStatus };

export interface CampaignDraft {
  type: AdsCampaignType;
  name: string;
  target_url: string;
  conversion_action: string | null;
  daily_budget_cents: number;
  start_date: string;
  end_date: string | null;
  language_code: string;
  location_id: number;
  headlines: string[];
  descriptions: string[];
  keywords: KeywordSpec[];
}

export interface KeywordSpec {
  keyword: string;
  match_type: 'BROAD' | 'PHRASE' | 'EXACT';
}

export interface BudgetCheckOk {
  ok: true;
}

export interface BudgetCheckFail {
  ok: false;
  reason:
    | 'daily_limit_exceeded'
    | 'monthly_projection_exceeded'
    | 'currency_mismatch'
    | 'invalid_budget';
  message: string;
}

export type BudgetCheckResult = BudgetCheckOk | BudgetCheckFail;

export interface CreateCampaignResult {
  google_campaign_id: string;
  google_ad_group_id: string;
  google_ad_id: string;
}

export interface CampaignPerformance {
  google_campaign_id: string;
  impressions: number;
  clicks: number;
  ctr_pct: number;
  avg_cpc_cents: number;
  spend_cents: number;
  conversions: number;
}
