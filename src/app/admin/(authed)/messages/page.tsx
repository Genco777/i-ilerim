import { listIncomingMessages } from '@/lib/db/queries/messages';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { MessageRow } from '@/components/message-row';
import type { IncomingMessage } from '@/types';

const STATUS_FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'new', label: 'Yeni' },
  { value: 'awaiting_approval', label: 'Onay bekliyor' },
  { value: 'replied', label: 'Cevaplandı' },
  { value: 'ignored', label: 'Yoksayıldı' },
  { value: 'failed', label: 'Hata' },
] as const;

type StatusValue = (typeof STATUS_FILTERS)[number]['value'];
type DbStatus = Exclude<StatusValue, 'all'>;

function isDbStatus(s: string): s is DbStatus {
  return ['new', 'awaiting_approval', 'replied', 'ignored', 'failed'].includes(
    s,
  );
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const statusParam = (params.status ?? 'all') as StatusValue;

  const messages: IncomingMessage[] = await listIncomingMessages({
    status: isDbStatus(statusParam) ? statusParam : undefined,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gelen Mesajlar</h2>
        <span className="text-xs text-muted-foreground">
          Polling: 3 dk · Otomatik bildirim aktif
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => {
          const active = f.value === statusParam;
          return (
            <Link
              key={f.value}
              href={f.value === 'all' ? '/admin/messages' : `/admin/messages?status=${f.value}`}
              className={
                'px-3 py-1.5 rounded-md text-sm border transition ' +
                (active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-muted')
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Bu filtrede mesaj yok.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Yeni FB/IG yorumları her 3 dakikada bir otomatik olarak çekilir.
              Telegram&apos;dan da bildirim alacaksın.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}
