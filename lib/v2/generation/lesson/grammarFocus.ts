import type { CoreItem } from './coreItems';

/**
 * Pedagogical day-plan grammar_focus.id → today's pattern.* ids.
 * Plan ids are not content ids; story coverage uses the mapped patterns.
 */
const FOCUS_TO_PATTERNS: Record<string, string[]> = {
  'articles.definite': ['pattern.article_gender', 'pattern.plural_s'],
  'polite.queria': ['pattern.queria_um_uma'],
  'pronouns.clitic_after': ['pattern.chamo_me'],
};

/**
 * Resolve a grammar_focus id to pattern ids that satisfy the ≥2-line rule.
 * Falls back to all today's core patterns when the focus is pedagogical and unmapped.
 */
export function resolveGrammarFocusPatternIds(
  focusId: string,
  coreItems: CoreItem[],
): string[] {
  if (focusId.startsWith('pattern.')) return [focusId];
  const mapped = FOCUS_TO_PATTERNS[focusId];
  if (mapped?.length) return [...mapped];
  return coreItems.filter((c) => c.kind === 'pattern').map((c) => c.id);
}
