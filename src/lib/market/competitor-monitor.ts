// Rhein-Main bölgesindeki rakip grafik/web tasarım işletmeleri
export const KNOWN_COMPETITORS = [
  { name: 'Grafikdesign Frankfurt', site: 'grafikdesign-frankfurt.de', city: 'Frankfurt' },
  { name: 'Webdesign Karben', site: 'webdesign-karben.de', city: 'Karben' },
  { name: 'Design Studio Bad Vilbel', site: 'design-bv.de', city: 'Bad Vilbel' },
  { name: 'Kreativagentur Friedberg', site: 'kreativagentur-fb.de', city: 'Friedberg' },
];

export interface CompetitorSnapshot {
  name: string;
  site: string;
  city: string;
  lastChecked: Date;
  status: 'up' | 'down' | 'redirected' | 'unknown';
  changes: CompetitorChange[];
}

export interface CompetitorChange {
  type: 'new_page' | 'price_change' | 'new_service' | 'redesign' | 'contact_change';
  description: string;
  detectedAt: Date;
}

// Lightweight competitor check — in production, use proper scraping
export async function checkCompetitors(): Promise<CompetitorSnapshot[]> {
  const results: CompetitorSnapshot[] = [];

  for (const comp of KNOWN_COMPETITORS) {
    try {
      const response = await fetch(`https://${comp.site}`, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'FlyFroth-MarketMonitor/1.0' },
      });
      results.push({
        name: comp.name,
        site: comp.site,
        city: comp.city,
        lastChecked: new Date(),
        status: response.ok ? 'up' : response.status >= 300 && response.status < 400 ? 'redirected' : 'down',
        changes: [],
      });
    } catch {
      results.push({
        name: comp.name,
        site: comp.site,
        city: comp.city,
        lastChecked: new Date(),
        status: 'unknown',
        changes: [],
      });
    }
  }

  return results;
}

export function formatCompetitorReport(snapshots: CompetitorSnapshot[]): string {
  if (snapshots.length === 0) return '';

  const lines: string[] = ['🏢 **Rakip Durumu**', ''];

  const up = snapshots.filter((s) => s.status === 'up');
  const down = snapshots.filter((s) => s.status === 'down' || s.status === 'unknown');

  if (down.length > 0) {
    for (const c of down) {
      lines.push(`🔴 ${c.name} (${c.city}): ${c.status === 'down' ? 'Site kapalı' : 'Erişilemiyor'}`);
    }
    lines.push('');
  }

  if (up.length > 0) {
    for (const c of up) {
      lines.push(`🟢 ${c.name} (${c.city}): Site aktif`);
    }
  }

  return lines.join('\n');
}
