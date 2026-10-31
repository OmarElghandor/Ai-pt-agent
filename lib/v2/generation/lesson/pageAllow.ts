/** Outline page fields needed to decide which item ids a page may use. */
export type OutlinePageIds = {
  index: number;
  page_id?: string;
  preset: string;
  role?: 'intro' | 'test';
  introduces: string[];
  assumes: string[];
};

export function isIntroStoryPage(page: {
  role?: string;
  index: number;
  preset: string;
}): boolean {
  return page.role === 'intro' || (page.index === 0 && page.preset === 'story');
}

/** Story pointer pages (intro or test replay) — no LLM page/critic/questions. */
export function isStoryPointerPage(page: {
  role?: string;
  index?: number;
  preset?: string;
  story_id?: string;
}): boolean {
  if (page.role === 'intro' || page.role === 'test') return true;
  if (page.preset === 'story' && page.story_id) return true;
  if (page.index === 0 && page.preset === 'story') return true;
  return false;
}

/** Ids introduced on earlier detail pages. The intro story pointer is skipped. */
export function earlierIntroducedIds(
  pages: OutlinePageIds[],
  index: number,
): string[] {
  const ids: string[] = [];
  for (const page of pages) {
    if (page.index >= index || isIntroStoryPage(page)) continue;
    for (const id of page.introduces ?? []) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * A detail page that introduces nothing may reuse ids from earlier detail pages.
 * Intro story pages are left unchanged.
 */
export function fillEmptyDetailAssumes<T extends OutlinePageIds>(
  pages: T[],
): { pages: T[]; filled: { index: number; assumes: string[] }[] } {
  const filled: { index: number; assumes: string[] }[] = [];
  const next = pages.map((page) => {
    if (isIntroStoryPage(page)) return page;
    if ((page.introduces ?? []).length > 0) return page;
    if ((page.assumes ?? []).length > 0) return page;
    const prior = earlierIntroducedIds(pages, page.index);
    if (!prior.length) return page;
    filled.push({ index: page.index, assumes: prior });
    return { ...page, assumes: prior };
  });
  return { pages: next, filled };
}

/**
 * Item ids the page may use. When a saved outline left both lists empty,
 * fall back to ids introduced on earlier detail pages.
 */
export function allowIdsForPage(
  entry: OutlinePageIds,
  pages: OutlinePageIds[],
): string[] {
  if (isIntroStoryPage(entry)) return [];
  const direct = [
    ...new Set([...(entry.introduces ?? []), ...(entry.assumes ?? [])]),
  ];
  if (direct.length) return direct;
  return earlierIntroducedIds(pages, entry.index);
}
