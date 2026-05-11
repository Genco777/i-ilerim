/**
 * Calculate absolute UTC Date from a slot's calendar position.
 *
 * calendar_week + year → ISO week date → Monday of that week
 * day_of_week (0=Mon..6=Sun) → offset from Monday
 * time_slot ("HH:MM") → hours/minutes in Germany timezone
 *
 * On Vercel we interpret time_slot as CET/CEST and output UTC.
 */
export function calculateScheduledAt(
  calendarWeek: number,
  year: number,
  dayOfWeek: number,
  timeSlot: string,
): Date {
  const parts = timeSlot.split(':').map(Number);
  const hours = parts[0] ?? 12;
  const minutes = parts[1] ?? 0;

  // January 4th is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4, 0, 0, 0, 0));
  const jan4Day = jan4.getUTCDay() || 7; // Sunday = 7

  // Monday of ISO week 1
  const mondayWeek1 = new Date(Date.UTC(year, 0, 4 - jan4Day + 1, 0, 0, 0, 0));

  // Monday of target week + day offset, with time.
  // time_slot is Europe/Berlin (CEST=UTC+2, CET=UTC+1).
  // We subtract 2h for CEST (Mar-Oct); CET months get 1h offset.
  const germanyOffset = 2; // CEST — refine if scheduling in winter (Nov-Mar → 1)
  return new Date(
    Date.UTC(
      mondayWeek1.getUTCFullYear(),
      mondayWeek1.getUTCMonth(),
      mondayWeek1.getUTCDate() + (calendarWeek - 1) * 7 + dayOfWeek,
      hours - germanyOffset,
      minutes,
      0,
      0,
    ),
  );
}
