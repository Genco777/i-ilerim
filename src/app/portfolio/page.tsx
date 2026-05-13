import { getPublishedPortfolio } from '@/lib/db/queries/site-content';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const items = await getPublishedPortfolio();

  return (
    <main className="max-w-5xl mx-auto px-4 py-16">
      <h1 className="text-4xl font-bold mb-2">Portfolio</h1>
      <p className="text-muted-foreground mb-10">Fly & Froth — Grafik- & Webdesign Studio</p>

      {items.length === 0 ? (
        <p className="text-muted-foreground">Henuz portfolyo ogresi eklenmemis.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg overflow-hidden bg-card">
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <h3 className="font-semibold text-lg">{item.title}</h3>
                {item.category && (
                  <span className="text-xs bg-secondary px-2 py-0.5 rounded-full">
                    {item.category}
                  </span>
                )}
                {item.description && (
                  <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
