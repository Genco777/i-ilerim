/**
 * Geçmiş haftalara ait içerik planlarını ve slotlarını (cascade) siler.
 * Çalıştırmak için: pnpm tsx scripts/delete-old-plans.ts
 *
 * Slotlar content_plans.id üzerinden CASCADE silme ile otomatik silinir.
 */
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL_NON_POOLING ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_NON_POOLING / DATABASE_URL ayarlanmamış');
  process.exit(1);
}

const sql = neon(url);

// Şu anki haftayı hesapla
function getCurrentWeek(): { week: number; year: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return { week, year: now.getFullYear() };
}

async function main() {
  const { week: currentWeek, year: currentYear } = getCurrentWeek();
  console.log(`Mevcut hafta: ${currentYear}-W${currentWeek}`);
  console.log(`Bundan önceki tüm planlar silinecek...`);

  // Önce ne silineceğini göster
  const toDelete = await sql`
    SELECT id, calendar_week, year, status
    FROM content_plans
    WHERE year < ${currentYear}
       OR (year = ${currentYear} AND calendar_week < ${currentWeek})
    ORDER BY year, calendar_week
  `;

  if (toDelete.length === 0) {
    console.log('✅ Silinecek eski plan yok.');
    return;
  }

  console.log(`\nSilinecek ${toDelete.length} plan:`);
  for (const p of toDelete) {
    console.log(`  - ${p.year}-W${p.calendar_week} (${p.status}) [${p.id}]`);
  }

  // Slotları say (bilgi amaçlı)
  const ids = toDelete.map((p: { id: string }) => p.id);
  const slotCount = await sql`
    SELECT count(*)::int AS count
    FROM content_slots
    WHERE plan_id = ANY(${ids}::uuid[])
  `;
  console.log(`  → ${slotCount[0]?.count ?? 0} slot cascade ile silinecek`);

  // SİL
  const deleted = await sql`
    DELETE FROM content_plans
    WHERE year < ${currentYear}
       OR (year = ${currentYear} AND calendar_week < ${currentWeek})
    RETURNING id, calendar_week, year
  `;

  console.log(`\n✅ ${deleted.length} plan (ve slotları) silindi.`);
}

main().catch((err) => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});
