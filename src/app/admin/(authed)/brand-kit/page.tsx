import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { BrandKitForm } from '@/components/brand-kit-form';

export default async function BrandKitPage() {
  const kit = await getBrandKit();
  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-2xl font-bold">Brand Kit</h2>
      <p className="text-sm text-muted-foreground">
        Bu ayarlar her AI üretiminde otomatik olarak prompt&apos;a eklenir.
        Marka tutarlılığı buradan korunur.
      </p>
      <BrandKitForm initial={kit} />
    </div>
  );
}
