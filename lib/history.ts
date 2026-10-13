import type { TypedMessage } from './progressTypes';
import { typedToPlain } from './messages';

export type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
  at: number;
};

/** Last `n` learner messages and the partner replies that belong with them. */
export function lastExchanges(
  messages: Array<TypedMessage | HistoryMessage>,
  n = 6,
): HistoryMessage[] {
  const normalized: HistoryMessage[] = messages.map((m) => {
    if ('content' in m && typeof m.content === 'string') {
      return { role: m.role, content: m.content, at: m.at };
    }
    return { role: m.role, content: typedToPlain(m as TypedMessage), at: m.at };
  });

  let seen = 0;
  let start = 0;
  for (let i = normalized.length - 1; i >= 0; i--) {
    if (normalized[i].role === 'user') {
      seen += 1;
      if (seen === n) {
        start = i;
        break;
      }
    }
  }
  return normalized.slice(start);
}

export const THREAD_GAP_MS = 6 * 60 * 60 * 1000;

export function isThreadStale(lastAt: number | null, now: number): boolean {
  if (lastAt == null) return false;
  return now - lastAt > THREAD_GAP_MS;
}

/** Bom dia before noon, Boa tarde until 19:00, Boa noite from 19:00. */
export function dayPart(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

export function greetingPt(hour: number): string {
  const part = dayPart(hour);
  if (part === 'morning') return 'Bom dia!';
  if (part === 'afternoon') return 'Boa tarde!';
  return 'Boa noite!';
}
