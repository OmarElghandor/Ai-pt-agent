import type { PatternSlot } from '@/lib/v2/content/items';

/** Code-owned pattern shapes. Items/outline picks the kind; fill builds examples. */
export const PatternKindSchema = [
  'article_def',
  'article_indef',
  'plural_def',
  'polite_request',
] as const;

export type PatternKind = (typeof PatternKindSchema)[number];

const KIND_BY_ID: Record<string, PatternKind> = {
  'pattern.article_gender': 'article_def',
  'pattern.plural_s': 'plural_def',
  'pattern.queria_um_uma': 'polite_request',
  'pattern.day': 'polite_request',
};

/** Infer kind from explicit value or known pattern id. */
export function resolvePatternKind(
  patternId: string,
  kind?: string | null,
): PatternKind | null {
  if (
    kind === 'article_def' ||
    kind === 'article_indef' ||
    kind === 'plural_def' ||
    kind === 'polite_request'
  ) {
    return kind;
  }
  return KIND_BY_ID[patternId] ?? null;
}

/** Fixed slot templates keyed by pattern kind. */
export function slotsForKind(kind: PatternKind): PatternSlot[] {
  switch (kind) {
    case 'article_def':
      return [
        { name_eg: 'أداة', kind: 'article_o_a' },
        { name_eg: 'الاسم', kind: 'word' },
      ];
    case 'article_indef':
      return [
        { name_eg: 'أداة', kind: 'article_um_uma' },
        { name_eg: 'الاسم', kind: 'word' },
      ];
    case 'plural_def':
      return [
        { name_eg: 'أداة جمع', kind: 'article_os_as' },
        { name_eg: 'الاسم جمع', kind: 'word_plural' },
      ];
    case 'polite_request':
      return [
        { tl: 'Queria' },
        { name_eg: 'أداة', kind: 'article_um_uma' },
        { name_eg: 'الحاجة', kind: 'word' },
        { tl: ', por favor.' },
      ];
  }
}
