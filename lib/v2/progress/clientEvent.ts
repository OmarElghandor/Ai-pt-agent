/** Browser helper: fire a progress event (fire-and-forget). */

function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** `?dev=1` on the current page — only honored server-side for admin sessions. */
function clientDevFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('dev') === '1';
  } catch {
    return false;
  }
}

export function postProgressEvent(
  body: Record<string, unknown> & { kind: string },
): string {
  const event_id =
    typeof body.event_id === 'string' ? body.event_id : newEventId();
  const payload = {
    target_lang: 'pt-PT',
    ...body,
    event_id,
    ...(clientDevFlag() ? { dev: true } : {}),
  };
  if (typeof fetch === 'undefined') return event_id;
  void fetch('/api/v2/progress/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
  return event_id;
}
