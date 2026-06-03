// Google Calendar API v3 integration
// Requires: GOOGLE_CALENDAR_CLIENT_EMAIL and GOOGLE_CALENDAR_PRIVATE_KEY env vars
// Calendar ID: process.env.GOOGLE_CALENDAR_ID or 'primary'

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
  htmlLink?: string;
}

export interface TimeSlot {
  start: string; // HH:mm format
  end: string;
}

// Business hours: 09:00-17:00, Mon-Fri
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 17;
const SLOT_DURATION_MIN = 60;

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GOOGLE_CALENDAR_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_CALENDAR_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    throw new Error('Google Calendar kimlik bilgileri eksik (GOOGLE_CALENDAR_CLIENT_EMAIL, GOOGLE_CALENDAR_PRIVATE_KEY)');
  }

  // JWT sign manually with Web Crypto (browser-compatible)
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  // google-auth-library is now a regular dependency (see package.json)
  try {
    const { JWT } = await import('google-auth-library');
    const jwt = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const token = await jwt.getAccessToken();
    return token.token ?? '';
  } catch {
    return '';
  }
}

async function calendarApi<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Google API erisim tokeni alinamadi.');

  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}${path}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Calendar API hatasi (${response.status}): ${err.slice(0, 200)}`);
  }

  return response.json() as Promise<T>;
}

export async function listEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
  try {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const data = await calendarApi<{ items: CalendarEvent[] }>(
      `/events?${params.toString()}`,
      'GET',
    );

    return data.items ?? [];
  } catch (err) {
    console.error('[calendar] listEvents error:', err);
    return [];
  }
}

export async function createEvent(args: {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
}): Promise<CalendarEvent> {
  const event = {
    summary: args.summary,
    description: args.description ?? '',
    start: {
      dateTime: args.start.toISOString(),
      timeZone: 'Europe/Berlin',
    },
    end: {
      dateTime: args.end.toISOString(),
      timeZone: 'Europe/Berlin',
    },
    attendees: (args.attendees ?? []).map((email) => ({ email })),
    reminders: {
      useDefault: true,
    },
  };

  return calendarApi<CalendarEvent>('/events', 'POST', event);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await calendarApi(`/events/${encodeURIComponent(eventId)}`, 'DELETE');
}

export async function findFreeSlots(date: string): Promise<TimeSlot[]> {
  const dayStart = new Date(`${date}T0${WORK_START_HOUR}:00:00`);
  const dayEnd = new Date(`${date}T${WORK_END_HOUR}:00:00`);

  // Get busy slots from calendar
  const events = await listEvents(dayStart, dayEnd);
  const busySlots = events
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      start: new Date(e.start.dateTime!),
      end: new Date(e.end.dateTime!),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // Find free slots
  const freeSlots: TimeSlot[] = [];
  let cursor = dayStart;

  for (const busy of busySlots) {
    if (cursor < busy.start) {
      const gapMin = (busy.start.getTime() - cursor.getTime()) / 60000;
      if (gapMin >= SLOT_DURATION_MIN) {
        freeSlots.push({
          start: `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`,
          end: `${String(busy.start.getHours()).padStart(2, '0')}:${String(busy.start.getMinutes()).padStart(2, '0')}`,
        });
      }
    }
    cursor = busy.end > cursor ? busy.end : cursor;
  }

  if (cursor < dayEnd) {
    const gapMin = (dayEnd.getTime() - cursor.getTime()) / 60000;
    if (gapMin >= SLOT_DURATION_MIN) {
      freeSlots.push({
        start: `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`,
        end: `${WORK_END_HOUR}:00`,
      });
    }
  }

  return freeSlots;
}
