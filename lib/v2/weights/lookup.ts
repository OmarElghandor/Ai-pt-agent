/**
 * Weight lookup for practice builders (17 §4). Custom-only → fixed 30.
 */

export const CUSTOM_ONLY_WEIGHT = 30;

/** Learner / UGC custom items (`12`) use ids like `ugc.pt-PT.…`. */
export function isCustomOnlyItemId(itemId: string): boolean {
  return itemId.startsWith('ugc.');
}

/**
 * Resolve a weight when a stored row may be missing.
 * Custom-only and unknown official items both fall back to 30.
 */
export function weightOrDefault(
  itemId: string,
  stored: number | null | undefined,
): number {
  if (isCustomOnlyItemId(itemId)) return CUSTOM_ONLY_WEIGHT;
  if (stored == null || !Number.isFinite(stored)) return CUSTOM_ONLY_WEIGHT;
  return Math.min(100, Math.max(0, Math.floor(stored)));
}
