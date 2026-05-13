import { NextResponse } from 'next/server';
import { checkCompetitors, formatCompetitorReport } from '@/lib/market/competitor-monitor';
import {
  scanInternalOpportunities,
  detectMarketTrends,
  formatOpportunityReport,
} from '@/lib/market/opportunity-scanner';
import { notifyAdmins } from '@/lib/agent/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get('x-cron-secret') === expected) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const [competitors, opportunities, trends] = await Promise.all([
      checkCompetitors(),
      scanInternalOpportunities(),
      detectMarketTrends(),
    ]);

    const competitorReport = formatCompetitorReport(competitors);
    const opportunityReport = formatOpportunityReport(opportunities, trends);

    const fullReport = [competitorReport, opportunityReport].filter(Boolean).join('\n\n');

    if (fullReport) {
      await notifyAdmins(fullReport);
      return NextResponse.json({
        ok: true,
        notified: true,
        competitors: competitors.length,
        opportunities: opportunities.length,
        trends: trends.length,
        report: fullReport,
      });
    }

    return NextResponse.json({
      ok: true,
      notified: false,
      reason: 'no significant findings',
    });
  } catch (err) {
    console.error('[market-scan] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Scan failed' },
      { status: 500 },
    );
  }
}
