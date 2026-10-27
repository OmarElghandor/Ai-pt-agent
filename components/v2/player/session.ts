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

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function postPageAnswer(
  payload:
    | (Omit<Extract<PageAnswerPayload, { kind: 'page_ask' }>, 'answer_id'> & {
        answer_id?: string;
      })
    | (Omit<Extract<PageAnswerPayload, { kind: 'page_quiz' }>, 'answer_id'> & {
        answer_id?: string;
      }),
): void {
  const body = {
    ...payload,
    answer_id: payload.answer_id ?? newAnswerId(),
  };
  void fetch('/api/v2/answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timezone':
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC',
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}
