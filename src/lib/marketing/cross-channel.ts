import { db } from '@/lib/db';
import { posts, emailCampaigns, adsCampaigns, invoices } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export interface CrossChannelCampaign {
  id: string;
  name: string;
  channels: string[];
  status: 'planning' | 'running' | 'completed' | 'failed';
  results: ChannelResult[];
  createdAt: Date;
}

export interface ChannelResult {
  channel: 'instagram' | 'facebook' | 'email' | 'google_ads' | 'kleinanzeigen';
  status: 'pending' | 'success' | 'failed';
  details: string;
  metric?: string;
}

// Orchestrate multi-channel campaign
export async function launchCrossChannelCampaign(params: {
  name: string;
  topic: string;
  text: string;
  imagePrompt?: string;
  channels: string[];
  emailListId?: string;
  adBudgetCents?: number;
}): Promise<CrossChannelCampaign> {
  const campaign: CrossChannelCampaign = {
    id: crypto.randomUUID(),
    name: params.name,
    channels: params.channels,
    status: 'running',
    results: [],
    createdAt: new Date(),
  };

  const results: ChannelResult[] = [];

  for (const channel of params.channels) {
    try {
      switch (channel) {
        case 'instagram':
        case 'facebook': {
          const { generatePost } = await import('@/lib/content/generate-post');
          const post = await generatePost({
            topic: params.topic,
          });
          results.push({
            channel: channel as 'instagram' | 'facebook',
            status: 'success',
            details: `Post oluşturuldu: ${post.id}`,
            metric: post.id,
          });
          break;
        }

        case 'email': {
          // Trigger email campaign creation
          const [inserted] = await db
            .insert(emailCampaigns)
            .values({
              type: 'digest',
              subject: params.topic,
              body_html: params.text,
              status: 'draft',
            } as never)
            .returning();
          results.push({
            channel: 'email',
            status: 'success',
            details: `Email kampanyası taslağı: ${inserted?.id ?? 'unknown'}`,
          });
          break;
        }

        case 'google_ads': {
          results.push({
            channel: 'google_ads',
            status: 'pending',
            details: 'Google Ads kampanyası manuel onay gerektiriyor. /ads-create ile başlatın.',
          });
          break;
        }

        case 'kleinanzeigen': {
          results.push({
            channel: 'kleinanzeigen',
            status: 'pending',
            details: 'Kleinanzeigen ilanı güncellemesi için mevcut ilan IDsi gerekli.',
          });
          break;
        }
      }
    } catch (err) {
      results.push({
        channel: channel as 'instagram' | 'facebook' | 'email' | 'google_ads' | 'kleinanzeigen',
        status: 'failed',
        details: err instanceof Error ? err.message : 'Bilinmeyen hata',
      });
    }
  }

  campaign.results = results;

  const failed = results.filter((r) => r.status === 'failed').length;
  if (failed === results.length) {
    campaign.status = 'failed';
  } else if (results.every((r) => r.status === 'success')) {
    campaign.status = 'completed';
  }

  return campaign;
}

// Get cross-channel performance summary
export async function getCampaignPerformance(days = 30): Promise<{
  posts: { published: number; scheduled: number };
  email: { campaigns: number };
  ads: { active: number; totalDailyBudget: number };
  revenue: { invoiceCount: number; total: number };
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [postStats, emailStats, adStats, revenueStats] = await Promise.all([
    db
      .select({
        published: sql<number>`count(*) filter (where ${posts.status} = 'published')::int`,
        scheduled: sql<number>`count(*) filter (where ${posts.status} = 'scheduled')::int`,
      })
      .from(posts)
      .where(sql`${posts.created_at} >= ${since.toISOString()}`),
    db
      .select({ campaigns: sql<number>`count(*)::int` })
      .from(emailCampaigns)
      .where(sql`${emailCampaigns.created_at} >= ${since.toISOString()}`),
    db
      .select({
        active: sql<number>`count(*) filter (where ${adsCampaigns.status} = 'enabled')::int`,
        totalDailyBudget: sql<number>`COALESCE(SUM(${adsCampaigns.daily_budget_cents}), 0)`,
      })
      .from(adsCampaigns),
    db
      .select({
        invoiceCount: sql<number>`count(*)::int`,
        total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`,
      })
      .from(invoices)
      .where(sql`${invoices.created_at} >= ${since.toISOString()} AND ${invoices.status} = 'sent'`),
  ]);

  return {
    posts: {
      published: postStats[0]?.published ?? 0,
      scheduled: postStats[0]?.scheduled ?? 0,
    },
    email: {
      campaigns: emailStats[0]?.campaigns ?? 0,
    },
    ads: {
      active: adStats[0]?.active ?? 0,
      totalDailyBudget: adStats[0]?.totalDailyBudget ?? 0,
    },
    revenue: {
      invoiceCount: revenueStats[0]?.invoiceCount ?? 0,
      total: revenueStats[0]?.total ?? 0,
    },
  };
}
