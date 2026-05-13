import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function ProjePage() {
  // For public demo — in production this would be behind a project-specific link
  const recent = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      type: invoices.type,
      status: invoices.status,
      date: invoices.date,
    })
    .from(invoices)
    .orderBy(desc(invoices.date))
    .limit(20);

  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-2">Fly & Froth — Proje Durumu</h1>
      <p className="text-muted-foreground mb-10">
        Projenizin durumunu kontrol edin. Size verilen proje numarasini girin.
      </p>

      <form action="/proje/detay" method="GET" className="flex gap-3 mb-12">
        <input
          type="text"
          name="id"
          placeholder="Proje veya fatura numarasi (ornek: INV-2025-001)"
          className="flex-1 border rounded-lg px-4 py-3 text-sm bg-background"
          required
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Sorgula
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        Proje durumunuzu ogrenmek icin Telegram uzerinden{' '}
        <code className="text-xs bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">
          @FlyFrothbot
        </code>{' '}
        AI asistana da yazabilirsiniz. &quot;Proje durumum nedir?&quot; yazmaniz yeterli.
      </p>

      <div className="mt-12 border-t pt-8">
        <h2 className="text-lg font-semibold mb-4">Hizmetlerimiz</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
          <a href="/portfolio" className="border rounded-lg p-4 hover:border-primary transition-colors">
            Portfolio &rarr;
          </a>
          <a href="/blog" className="border rounded-lg p-4 hover:border-primary transition-colors">
            Blog &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
