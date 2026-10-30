import type { ProgressError } from './types';

/** Accent never feeds weak areas. */
export function isWeakEligibleError(err: ProgressError): boolean {
  return err.scope !== 'accent';
}

/**
 * Weak area: 3 errors with the same scope + tool_id in the last 10 attempts.
 * Returns the tool_id that became weak, or null.
 */
export function detectWeakArea(
  recentErrors: ProgressError[],
  opts?: { scope?: string; tool_id?: string },
): string | null {
  const last10 = recentErrors.slice(-10).filter(isWeakEligibleError);
  const counts = new Map<string, number>();
  for (const err of last10) {
    if (!err.tool_id) continue;
    if (opts?.scope && err.scope !== opts.scope) continue;
    if (opts?.tool_id && err.tool_id !== opts.tool_id) continue;
    const key = `${err.scope}::${err.tool_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of counts) {
    if (n >= 3) {
      const toolId = key.split('::')[1] ?? null;
      if (toolId) return toolId;
    }
  }
  return null;
}

/**
 * After appending one error, check if that scope+tool is now weak.
 */
export function weakToolAfterError(
  recentIncludingNew: ProgressError[],
): string | null {
  const last = recentIncludingNew[recentIncludingNew.length - 1];
  if (!last || !isWeakEligibleError(last) || !last.tool_id) return null;
  const last10 = recentIncludingNew.slice(-10).filter(isWeakEligibleError);
  const n = last10.filter(
    (e) => e.scope === last.scope && e.tool_id === last.tool_id,
  ).length;
  return n >= 3 ? last.tool_id : null;
}

/**
 * Item ids that the weak-area rule marks weak.
 * `errors` is chronological (oldest first). Uses the last 10 eligible attempts.
 * An item is weak when 3 of those share its scope + tool_id.
 */
export function weakItemIdsFromErrors(errors: ProgressError[]): Set<string> {
  const last10 = errors.slice(-10).filter(isWeakEligibleError);
  const groups = new Map<string, ProgressError[]>();
  for (const err of last10) {
    if (!err.tool_id) continue;
    const key = `${err.scope}::${err.tool_id}`;
    const list = groups.get(key) ?? [];
    list.push(err);
    groups.set(key, list);
  }
  const ids = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    for (const err of list) {
      if (err.item_id) ids.add(err.item_id);
    }
  }
  return ids;
}
