import { db } from '@/lib/db';
import { invoices, type InvoiceRecipient } from '@/lib/db/schema';
import { or, ilike } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ id?: string }>;
}

function getRecipientField(recipient: InvoiceRecipient | null, field: 'name' | 'company'): string {
  if (!recipient) return '-';
  return recipient[field] ?? '-';
}

export default async function ProjeDetayPage({ searchParams }: Props) {
  const { id } = await searchParams;

  if (!id) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Proje Numarasi Gerekli</h1>
        <p className="text-muted-foreground mb-6">Lutfen bir proje veya fatura numarasi girin.</p>
        <a href="/proje" className="text-primary hover:underline">&larr; Geri</a>
      </main>
    );
  }

  const rows = await db
    .select()
    .from(invoices)
    .where(or(ilike(invoices.number, `%${id}%`), ilike(invoices.id, `%${id}%`)))
    .limit(5);

  if (!rows.length) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Proje Bulunamadi</h1>
        <p className="text-muted-foreground mb-6">
          &quot;{id}&quot; ile eslesen proje veya fatura bulunamadi.
        </p>
        <a href="/proje" className="text-primary hover:underline">&larr; Geri</a>
      </main>
    );
  }

  const typeLabels: Record<string, string> = {
    rechnung: 'Fatura',
    teilrechnung: 'Kismi Fatura',
    schlussrechnung: 'Kesin Fatura',
    angebot: 'Teklif',
  };

  const statusStyles: Record<string, string> = {
    sent: 'bg-blue-100 text-blue-800',
    collecting: 'bg-yellow-100 text-yellow-800',
    preview: 'bg-purple-100 text-purple-800',
    converted: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    deleted: 'bg-gray-100 text-gray-500',
  };

  const statusLabels: Record<string, string> = {
    sent: 'Gonderildi',
    collecting: 'Hazirlaniyor',
    preview: 'Onizleme',
    converted: 'Donusturuldu',
    cancelled: 'Iptal',
    deleted: 'Silindi',
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold mb-8">Proje Durumu</h1>

      {rows.map((inv) => (
        <div key={inv.id} className="border rounded-lg p-6 mb-4">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-semibold">{inv.number}</h2>
              <p className="text-sm text-muted-foreground">
                {typeLabels[inv.type] ?? inv.type}
                {' — '}{inv.date}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusStyles[inv.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}>
              {statusLabels[inv.status ?? ''] ?? inv.status}
            </span>
          </div>

          {inv.recipient && (
            <div className="text-sm text-muted-foreground border-t pt-4">
              <p className="font-medium text-foreground">Musteri:</p>
              <p>{getRecipientField(inv.recipient, 'name')}</p>
              <p>{getRecipientField(inv.recipient, 'company')}</p>
            </div>
          )}
        </div>
      ))}

      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          Detayli bilgi icin Telegram&apos;dan AI asistana yazin:
        </p>
        <a href="https://t.me/FlyFrothbot" target="_blank" className="text-primary hover:underline font-medium">
          @FlyFrothbot &rarr;
        </a>
      </div>

      <div className="mt-8 text-center">
        <a href="/proje" className="text-sm text-muted-foreground hover:underline">&larr; Yeni sorgula</a>
      </div>
    </main>
  );
}
