import { db } from '@/lib/db';
import { incomingMessages, kleinanzeigenThreads } from '@/lib/db/schema';
import { desc, sql } from 'drizzle-orm';

export interface BusinessOpportunity {
  source: 'search' | 'social' | 'internal' | 'kleinanzeigen';
  title: string;
  description: string;
  potentialValue: string;
  actionItems: string[];
  discoveredAt: Date;
}

export interface MarketTrend {
  category: string;
  trend: 'rising' | 'stable' | 'declining';
  evidence: string;
  recommendedAction: string;
}

// Scan internal data for business opportunities
export async function scanInternalOpportunities(): Promise<BusinessOpportunity[]> {
  const opportunities: BusinessOpportunity[] = [];

  // 1. Frequent Kleinanzeigen requests — is there a pattern?
  const [kzStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      topics: sql<string[]>`array_agg(distinct ${kleinanzeigenThreads.listing_title})`,
    })
    .from(kleinanzeigenThreads)
    .where(sql`${kleinanzeigenThreads.created_at} > now() - interval '30 days'`);

  if ((kzStats?.total ?? 0) > 20) {
    opportunities.push({
      source: 'kleinanzeigen',
      title: 'Yüksek Kleinanzeigen talebi',
      description: `Son 30 günde ${kzStats!.total} Kleinanzeigen mesajı alındı. Yoğun talep var.`,
      potentialValue: 'Aylık 2-5 ek iş',
      actionItems: [
        'Kleinanzeigen ilanlarını güncelle ve öne çıkar',
        'Express teslimat seçeneği ekle',
        'Fiyatları piyasa ortalamasının %10 üstüne çek',
      ],
      discoveredAt: new Date(),
    });
  }

  // 2. Social messages — which platforms bring the most leads?
  const [socialStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      platforms: sql<Record<string, number>>`jsonb_object_agg(platform, cnt)`,
    })
    .from(
      db
        .select({
          platform: incomingMessages.platform,
          cnt: sql<number>`count(*)::int`.as('cnt'),
        })
        .from(incomingMessages)
        .where(sql`${incomingMessages.received_at} > now() - interval '60 days'`)
        .groupBy(incomingMessages.platform)
        .as('platform_counts'),
    );

  if ((socialStats?.total ?? 0) > 30) {
    const platforms = socialStats!.platforms ?? {};
    const topPlatform = Object.entries(platforms).sort((a, b) => b[1] - a[1])[0];

    opportunities.push({
      source: 'social',
      title: 'Sosyal medya lead kaynağı analizi',
      description: `Son 60 günde ${socialStats!.total} mesaj. En çok lead: ${topPlatform?.[0] ?? 'bilinmiyor'} (${topPlatform?.[1] ?? 0} mesaj).`,
      potentialValue: 'Platforma özel outreach stratejisi ile %30 daha fazla lead',
      actionItems: [
        `${topPlatform?.[0] ?? 'Platform'} için özel içerik stratejisi oluştur`,
        'Diğer platformlarda varlığı güçlendir',
        'Lead yakalama formu linkini profile ekle',
      ],
      discoveredAt: new Date(),
    });
  }

  return opportunities;
}

// Analyze market trends from internal data
export async function detectMarketTrends(): Promise<MarketTrend[]> {
  const trends: MarketTrend[] = [];

  // Service type distribution from Kleinanzeigen listings
  const [kzTypes] = await db
    .select({
      titles: sql<string[]>`array_agg(${kleinanzeigenThreads.listing_title})`,
    })
    .from(kleinanzeigenThreads)
    .where(sql`${kleinanzeigenThreads.created_at} > now() - interval '60 days'`);

  const titles = (kzTypes?.titles ?? []).map((t) => (t ?? '').toLowerCase()).join(' ');

  const logoTrend = (titles.match(/logo/gi) ?? []).length;
  const flyerTrend = (titles.match(/flyer/gi) ?? []).length;
  const webTrend = (titles.match(/web|website|homepage/gi) ?? []).length;
  const expressTrend = (titles.match(/24h|express|schnell|acil/gi) ?? []).length;

  if (logoTrend > flyerTrend && logoTrend > webTrend) {
    trends.push({
      category: 'Logo Tasarımı',
      trend: 'rising',
      evidence: `Son 60 günde logo talepleri diğer kategorilerden fazla (logo: ${logoTrend}, flyer: ${flyerTrend}, web: ${webTrend})`,
      recommendedAction: 'Logo fiyatlandırmasını gözden geçir, express logo paketi ekle.',
    });
  }

  if (expressTrend > 5) {
    trends.push({
      category: 'Express Teslimat',
      trend: 'rising',
      evidence: `${expressTrend} adet express/24h talep tespit edildi`,
      recommendedAction: 'Express teslimat premium fiyatlandırması ekle (+%30-50).',
    });
  }

  return trends;
}

export function formatOpportunityReport(
  opportunities: BusinessOpportunity[],
  trends: MarketTrend[],
): string {
  const lines: string[] = [];

  if (trends.length > 0) {
    lines.push('📈 **Pazar Trendleri**', '');
    for (const t of trends) {
      const icon = t.trend === 'rising' ? '📈' : t.trend === 'declining' ? '📉' : '📊';
      lines.push(`${icon} **${t.category}** — ${t.trend}`);
      lines.push(`   ${t.evidence}`);
      lines.push(`   → ${t.recommendedAction}`);
      lines.push('');
    }
  }

  if (opportunities.length > 0) {
    lines.push('🎯 **İş Fırsatları**', '');
    for (const o of opportunities) {
      lines.push(`💼 **${o.title}**`);
      lines.push(`   ${o.description}`);
      lines.push(`   Değer: ${o.potentialValue}`);
      for (const action of o.actionItems) {
        lines.push(`   ☐ ${action}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
