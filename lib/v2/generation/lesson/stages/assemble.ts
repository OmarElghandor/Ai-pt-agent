import type { Item } from '@/lib/v2/content/items';
import type { LessonPack, Micro, Question, SpeakPrompt } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import { modeForPreset } from '@/lib/v2/content/page';
import { applyCommonMistakesToQuestions } from '../commonMistakes';
import type { OutlineResult } from './types';

const PRACTICE_PER_BLOCK_MAX = 3;

/**
 * Fill practice.questions from the day's question bank by page_index.
 * Page jobs must not invent question ids.
 */
export function fillPracticeQuestions(
  pages: Page[],
  questions: Question[],
): Page[] {
  return pages.map((page, pageIndex) => {
    const ids = questions
      .filter((q) => q.page_index === pageIndex)
      .map((q) => q.id);
    if (ids.length === 0) return page;
    let cursor = 0;
    const blocks = page.blocks.map((block) => {
      if (block.type !== 'practice') return block;
      const slice = ids.slice(cursor, cursor + PRACTICE_PER_BLOCK_MAX);
      cursor += slice.length;
      return { ...block, questions: slice };
    });
    return { ...page, blocks };
  });
}

/**
 * Assign 2–3 rule questions into page.check for sections grammar pages.
 */
export function fillSectionsCheck(
  pages: Page[],
  questions: Question[],
): Page[] {
  return pages.map((page, pageIndex) => {
    if (page.mode !== 'sections') return page;
    const ids = questions
      .filter((q) => q.page_index === pageIndex)
      .map((q) => q.id);
    if (ids.length === 0) return page;
    const check = ids.slice(0, 3);
    return { ...page, check, steps: undefined };
  });
}

/**
 * Assemble a LessonPack strictly by outline index (never by completion order).
 * Sets introduced_on_page on items from the outline introduces lists.
 * Fills practice.questions from questions.page_index.
 */
export function assembleLessonPack(opts: {
  day: number;
  targetLang?: string;
  outline: OutlineResult;
  /** Sparse or ordered pages; missing slots throw. */
  pagesByIndex: Map<number, Page> | (Page | null | undefined)[];
  questions: Question[];
  micro?: Micro;
  speak_prompts?: SpeakPrompt[];
  /** Recycle ids are never marked introduced_on_page. */
  recycleIds?: string[];
  /** Story document id (lesson does not copy lines). */
  storyId?: string;
}): LessonPack {
  const target_lang = opts.targetLang ?? 'pt-PT';
  const sortedPlan = [...opts.outline.pages].sort((a, b) => a.index - b.index);

  const pagesRaw: Page[] = [];
  for (const entry of sortedPlan) {
    const page =
      opts.pagesByIndex instanceof Map
        ? opts.pagesByIndex.get(entry.index)
        : opts.pagesByIndex[entry.index];
    if (!page) {
      throw new Error(`Missing page at outline index ${entry.index} (${entry.page_id})`);
    }
    const mode = modeForPreset(entry.preset);
    const role = entry.role ?? page.role;
    const isIntroStory =
      role === 'intro' || (entry.index === 0 && entry.preset === 'story');
    const isTestStory = role === 'test';
    pagesRaw.push({
      ...page,
      id: entry.page_id,
      preset: entry.preset,
      mode,
      ...(isIntroStory
        ? {
            role: 'intro' as const,
            steps: undefined,
            cover: undefined,
            quiz: undefined,
          }
        : isTestStory
          ? {
              role: 'test' as const,
              steps: undefined,
              cover: undefined,
              quiz: undefined,
            }
          : role
            ? { role }
            : {}),
    });
  }

  const lessonMeta = opts.outline.lesson ?? {};
  const story_id =
    lessonMeta.story_id ??
    pagesRaw.find((p) => p.story_id)?.story_id ??
    opts.storyId;

  // Attach story_id on intro pointer pages (test reuses page 0 via ?mode=test).
  const pagesWithStoryId = pagesRaw
    .filter((p) => p.role !== 'test')
    .map((p) => {
      if (
        story_id &&
        (p.role === 'intro' || p.preset === 'story') &&
        !p.story_id
      ) {
        return { ...p, story_id };
      }
      return p;
    });
  const pagesChecked = fillSectionsCheck(
    fillPracticeQuestions(pagesWithStoryId, opts.questions),
    opts.questions,
  );

  const { pages, questions } = applyCommonMistakesToQuestions(
    pagesChecked,
    opts.questions,
  );

  const recycleIds = new Set(opts.recycleIds ?? []);
  const introMap = new Map<string, number>();
  for (const entry of sortedPlan) {
    for (const id of entry.introduces) {
      if (recycleIds.has(id)) continue; // recycle is never "introduced"
      if (!introMap.has(id)) introMap.set(id, entry.index);
    }
  }

  const items: Item[] = opts.outline.items.map((item) => {
    if (recycleIds.has(item.id)) {
      const { introduced_on_page: _drop, ...rest } = item as Item & {
        introduced_on_page?: number;
      };
      return rest as Item;
    }
    const intro = introMap.get(item.id);
    if (intro == null) return item;
    return { ...item, introduced_on_page: intro };
  });

  const lesson: LessonPack['lesson'] = {
    id: lessonMeta.id ?? `${target_lang}.d${String(opts.day).padStart(2, '0')}`,
    target_lang: lessonMeta.target_lang ?? target_lang,
    day: lessonMeta.day ?? opts.day,
    phase: lessonMeta.phase,
    week: lessonMeta.week,
    kind: lessonMeta.kind ?? 'lesson',
    ...(story_id ? { story_id } : {}),
    situation: lessonMeta.situation,
    can_do: lessonMeta.can_do,
    pages: pages.map((p) => p.id),
  };

  return {
    lesson,
    items,
    pages,
    questions,
    ...(opts.micro ? { micro: opts.micro } : {}),
    ...(opts.speak_prompts ? { speak_prompts: opts.speak_prompts } : {}),
  };
}

/** Build pagesByIndex map from a sparse array without reordering by completion. */
export function pagesMapFromSparse(pages: (Page | null | undefined)[]): Map<number, Page> {
  const map = new Map<number, Page>();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p) map.set(i, p);
  }
  return map;
}
