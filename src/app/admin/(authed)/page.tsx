import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { count, eq } from 'drizzle-orm';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default async function Dashboard() {
  const [drafts, scheduled, published, failed] = await Promise.all([
    db.select({ count: count() }).from(posts).where(eq(posts.status, 'draft')),
    db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, 'scheduled')),
    db
      .select({ count: count() })
      .from(posts)
      .where(eq(posts.status, 'published')),
    db.select({ count: count() }).from(posts).where(eq(posts.status, 'failed')),
  ]);

  const stats = [
    { label: 'Drafts', value: drafts[0]?.count ?? 0 },
    { label: 'Scheduled', value: scheduled[0]?.count ?? 0 },
    { label: 'Published', value: published[0]?.count ?? 0 },
    { label: 'Failed', value: failed[0]?.count ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{s.value}</CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
        <a href="/portfolio" className="border rounded-lg p-4 hover:border-primary transition-colors">
          <h3 className="font-semibold">Portfolio</h3>
          <p className="text-sm text-muted-foreground">Calismalari gor</p>
        </a>
        <a href="/blog" className="border rounded-lg p-4 hover:border-primary transition-colors">
          <h3 className="font-semibold">Blog</h3>
          <p className="text-sm text-muted-foreground">Yazilari gor</p>
        </a>
        <a href="/admin/brand-kit" className="border rounded-lg p-4 hover:border-primary transition-colors">
          <h3 className="font-semibold">Brand Kit</h3>
          <p className="text-sm text-muted-foreground">Marka ayarlari</p>
        </a>
      </div>
      <p className="text-sm text-muted-foreground mt-4">
        Site icerigini Telegram bot{' '}
        <code className="text-xs bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">
          @FlyFrothbot
        </code>{' '}
        uzerinden AI asistana soyleyerek guncelleyebilirsin.
      </p>
    </div>
  );
}
