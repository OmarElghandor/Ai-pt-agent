import type { PageAnswerPayload } from '@/lib/v2/render/answerPayload';

function key(day: number): string {
  return `v2-day-${day}-done`;
}

export function readDonePages(day: number): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(key(day));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export function markPageDone(day: number, pageId: string): void {
  const next = new Set(readDonePages(day));
  next.add(pageId);
  sessionStorage.setItem(key(day), JSON.stringify([...next]));
}

export function postPageAnswer(payload: PageAnswerPayload): void {
  void fetch('/api/v2/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
