'use client';

import { useState } from 'react';
import type { IncomingMessage } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const PLATFORM_LABELS: Record<string, string> = {
  fb_comment: 'FB Yorum',
  fb_dm: 'FB DM',
  ig_comment: 'IG Yorum',
  ig_dm: 'IG DM',
  wa_message: 'WhatsApp',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  drafting: 'Taslak',
  awaiting_approval: 'Onay bekliyor',
  replied: 'Cevaplandı',
  ignored: 'Yoksayıldı',
  failed: 'Hata',
};

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  drafting:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  awaiting_approval:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  replied:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  ignored:
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
};

export function MessageRow({ message }: { message: IncomingMessage }) {
  const [text, setText] = useState(
    message.final_reply ?? message.draft_reply ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(message.status);
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'send' | 'ignore' | 'save') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/messages/${message.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, text }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Hata');
        return;
      }
      if (data.status) setStatus(data.status as IncomingMessage['status']);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const platformLabel = PLATFORM_LABELS[message.platform] ?? message.platform;
  const statusLabel = STATUS_LABELS[status] ?? status;
  const statusColor =
    STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-700';
  const replied = status === 'replied' || status === 'ignored';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {message.sender_name}{' '}
            <span className="text-xs text-muted-foreground font-normal">
              · {platformLabel}
            </span>
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            {new Date(message.received_at).toLocaleString('de-DE', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </div>
        </div>
        <span className={'text-xs px-2 py-1 rounded ' + statusColor}>
          {statusLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm whitespace-pre-wrap rounded-md bg-muted p-3">
          {message.message_text}
        </div>

        {!replied && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Cevap (taslak):
              </label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Cevap metnini buraya yaz…"
                className="mt-1"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => call('send')}
                disabled={busy || text.trim().length === 0}
              >
                {busy ? 'Gönderiliyor…' : 'Cevabı Gönder'}
              </Button>
              <Button
                variant="outline"
                onClick={() => call('save')}
                disabled={busy}
              >
                Taslağı Kaydet
              </Button>
              <Button
                variant="ghost"
                onClick={() => call('ignore')}
                disabled={busy}
              >
                Yoksay
              </Button>
            </div>
          </>
        )}

        {status === 'replied' && message.final_reply && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Gönderilen cevap:
            </div>
            <div className="text-sm whitespace-pre-wrap rounded-md bg-green-50 dark:bg-green-900/20 p-3">
              {message.final_reply}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
