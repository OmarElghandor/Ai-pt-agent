/**
 * Shared ranking for practice builders (16 §4 ranking).
 */

export type RankableItem = {
  item_id: string;
  essential?: boolean;
  isWeak?: boolean;
  isDue?: boolean;
  isNew?: boolean;
  /** Overdue by milliseconds (higher = more overdue). */
  overdueMs?: number;
  /** Lesson day (higher = newer). */
  lessonDay?: number;
  /** Mastery stage 1–4 (lower first). */
  stage?: number;
};

/**
 * Sort in place: essential → weak → due → new → most overdue → newest lesson → lower stage.
 */
export function rankPracticeItems<T extends RankableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const e = Number(Boolean(b.essential)) - Number(Boolean(a.essential));
    if (e) return e;
    const w = Number(Boolean(b.isWeak)) - Number(Boolean(a.isWeak));
    if (w) return w;
    const d = Number(Boolean(b.isDue)) - Number(Boolean(a.isDue));
    if (d) return d;
    const n = Number(Boolean(b.isNew)) - Number(Boolean(a.isNew));
    if (n) return n;
    const o = (b.overdueMs ?? 0) - (a.overdueMs ?? 0);
    if (o) return o;
    const day = (b.lessonDay ?? 0) - (a.lessonDay ?? 0);
    if (day) return day;
    return (a.stage ?? 1) - (b.stage ?? 1);
  });
}

export type FillByBudgetOpts<T> = {
  candidates: T[];
  budgetSeconds: number;
  secondsPerItem: number;
  maxItems?: number;
};

/** Take ranked items until the time budget is used (within one step). */
export function fillByBudget<T>(opts: FillByBudgetOpts<T>): T[] {
  const out: T[] = [];
  let used = 0;
  const max = opts.maxItems ?? Infinity;
  for (const c of opts.candidates) {
    if (out.length >= max) break;
    if (used + opts.secondsPerItem > opts.budgetSeconds && out.length > 0) {
      break;
    }
    if (opts.secondsPerItem > opts.budgetSeconds && out.length === 0) {
      // Allow one item even if it slightly exceeds (budget within one step)
      out.push(c);
      break;
    }
    out.push(c);
    used += opts.secondsPerItem;
  }
  return out;
}
