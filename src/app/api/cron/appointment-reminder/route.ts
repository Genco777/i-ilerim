import { NextResponse } from 'next/server';
import { listEvents } from '@/lib/calendar/google';
import { notifyAdmins } from '@/lib/agent/notifications';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get('x-cron-secret') === expected) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const now = new Date();
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    const oneHourFifteenLater = new Date(now.getTime() + 75 * 60 * 1000);

    // Find appointments starting in the next hour
    const upcoming = await listEvents(oneHourLater, oneHourFifteenLater);

    if (upcoming.length > 0) {
      for (const event of upcoming) {
        const startTime = event.start?.dateTime
          ? new Date(event.start.dateTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
          : 'bilinmiyor';

        const attendees = event.attendees?.map((a: { email: string }) => a.email).join(', ') ?? 'yok';
        const text = [
          '⏰ **Randevu Hatirlatmasi**',
          '',
          `📋 ${event.summary}`,
          `🕐 ${startTime} (1 saat sonra)`,
          `👤 Katilimcilar: ${attendees}`,
          '',
          event.description ? `Not: ${event.description}` : '',
        ].filter(Boolean).join('\n');

        await notifyAdmins(text);
      }

      return NextResponse.json({
        ok: true,
        notified: true,
        upcomingAppointments: upcoming.length,
      });
    }

    return NextResponse.json({
      ok: true,
      notified: false,
      reason: 'no upcoming appointments in the next hour',
    });
  } catch (err) {
    console.error('[appointment-reminder] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Reminder failed' },
      { status: 500 },
    );
  }
}
