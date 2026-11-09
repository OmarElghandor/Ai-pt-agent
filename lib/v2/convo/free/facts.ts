import { contentTokens } from './offTopic';

export const FREE_FACTS_MAX = 5;

/**
 * Extract at most one fact from the learner reply when an angle closes.
 * Uses item hints / suggested words present in the reply (no model).
 */
export function extractFreeFact(opts: {
  learnerText: string;
  hints: string[];
}): string | null {
  const text = opts.learnerText.trim();
  if (!text) return null;
  const tokens = new Set(contentTokens(text));
  for (const hint of opts.hints) {
    const parts = contentTokens(hint);
    if (parts.length === 0) continue;
    if (parts.every((p) => tokens.has(p)) || tokens.has(parts[0]!)) {
      return `said ${hint}`;
    }
  }
  return null;
}

/** Append a fact; drop oldest when over max. */
export function pushFreeFact(
  facts: string[],
  fact: string | null,
  max = FREE_FACTS_MAX,
): string[] {
  if (!fact) return facts;
  const next = [...facts.filter((f) => f !== fact), fact];
  while (next.length > max) next.shift();
  return next;
}
