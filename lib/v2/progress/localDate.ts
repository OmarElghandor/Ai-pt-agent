/**
 * YYYY-MM-DD in the given IANA timezone (fallback UTC).
 */
export function localDateString(
  now: Date = new Date(),
  timeZone = 'UTC',
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // invalid tz
  }
  return now.toISOString().slice(0, 10);
}

/** Offset of `timeZone` at `date`: local-clock-as-UTC minus the real instant. */
function zonedOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const bag: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(
    Number(bag.year),
    Number(bag.month) - 1,
    Number(bag.day),
    hour,
    Number(bag.minute),
    Number(bag.second),
  );
  return asUTC - date.getTime();
}

/**
 * Local midnight, plus `addDays` calendar days, as a UTC instant.
 * Two passes so a DST boundary doesn't land on the wrong offset.
 */
export function startOfLocalDay(
  now: Date = new Date(),
  timeZone = 'UTC',
  addDays = 0,
): Date {
  const local = localDateString(now, timeZone);
  const [y, m, d] = local.split('-').map(Number);
  const utcMidnight = Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + addDays);
  let cursor = new Date(utcMidnight);
  for (let i = 0; i < 2; i++) {
    cursor = new Date(utcMidnight - zonedOffsetMs(cursor, timeZone));
  }
  return cursor;
}

/** Last millisecond of the next local calendar day. Cards due that day are included. */
export function endOfTomorrow(now: Date = new Date(), timeZone = 'UTC'): Date {
  return new Date(startOfLocalDay(now, timeZone, 2).getTime() - 1);
}
