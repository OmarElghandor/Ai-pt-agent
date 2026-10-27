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
