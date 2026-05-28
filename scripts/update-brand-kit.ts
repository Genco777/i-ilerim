/**
 * Veritabanındaki brand_kit kaydını doğru marka renkleriyle günceller.
 * Çalıştırmak için: pnpm tsx scripts/update-brand-kit.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const NEW_VISUAL_STYLE = `Warm, natural, editorial photography style. Think Kinfolk or Monocle magazine meets professional German design studio.
Fly & Froth brand colors: deep navy (#1A2340) as primary dark tone, steel blue (#8A9DC8) as accent.
These colors appear as natural props in the scene — a navy notebook, a steel-blue ceramic mug — never as painted studio backgrounds.
Surfaces: pale oak wood, warm concrete, linen, cotton paper. Natural daylight or warm-toned ambient light. No flash, no ring lights.
The image must be photorealistic and indistinguishable from a real professional photograph.
Shallow depth of field. Authentic, candid composition — not staged or stock-photo.
No text, no watermarks, no logos in the image. Clean, considered, beautiful.`;

const NEW_BRAND_COLORS = JSON.stringify(['#1A2340', '#8A9DC8']);

async function main() {
  console.log('brand_kit güncelleniyor...');

  const rows = await sql`
    UPDATE brand_kit
    SET
      visual_style_guide = ${NEW_VISUAL_STYLE},
      brand_colors       = ${NEW_BRAND_COLORS}::jsonb,
      updated_at         = NOW()
    WHERE id = 1
    RETURNING id, brand_colors, updated_at
  `;

  if (!rows[0]) {
    console.error('❌ Satır bulunamadı — brand_kit tablosunda id=1 yok.');
    process.exit(1);
  }

  console.log('✅ Güncellendi:');
  console.log('   id          :', rows[0].id);
  console.log('   brand_colors:', rows[0].brand_colors);
  console.log('   updated_at  :', rows[0].updated_at);
}

main().catch((err) => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});
