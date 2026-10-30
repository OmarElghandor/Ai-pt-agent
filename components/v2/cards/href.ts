export function cardsHref(
  path: string,
  day: number | null,
  params?: Record<string, string | undefined>,
) {
  const sp = new URLSearchParams();
  if (day != null) sp.set('day', String(day));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) sp.set(key, value);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}

/** Query for the cards APIs. `day` is sent only as a seed override. */
export function apiQuery(day: number | null) {
  const sp = new URLSearchParams();
  if (day != null) sp.set('day', String(day));
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) sp.set('tz', tz);
  } catch {
    // Intl missing
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}
