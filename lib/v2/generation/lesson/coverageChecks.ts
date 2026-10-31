import type { Item } from '@/lib/v2/content/items';
import type { LessonPack, Micro, Question } from '@/lib/v2/content/lesson';
import type { Issue } from '@/lib/v2/content/validate';
import type { CoreItem } from './coreItems';

function issue(
  path: string,
  rule: string,
  message: string,
  severity: Issue['severity'] = 'warning',
): Issue {
  return { path, rule, message, severity };
}

function parentPatternId(id: string): string | null {
  const m = id.match(/^(pattern\..+)\.ex\.\d+$/);
  return m?.[1] ?? null;
}

/** Collect item ids referenced on story/intro dialogue lines or story handoff. */
function storyDialogueIds(
  pack: LessonPack,
  storyLineIds?: string[][],
): Set<string> {
  const ids = new Set<string>();
  if (storyLineIds?.length) {
    for (const lineIds of storyLineIds) {
      for (const id of lineIds) ids.add(id);
    }
    return ids;
  }
  for (const page of pack.pages) {
    if (page.preset !== 'story' && page.role !== 'intro') continue;
    for (const block of page.blocks) {
      if (block.type !== 'dialogue') continue;
      for (const line of block.lines) {
        for (const id of line.ids ?? []) ids.add(id);
      }
    }
  }
  return ids;
}

function dictionaryWordIds(pack: LessonPack): Set<string> {
  const ids = new Set<string>();
  for (const page of pack.pages) {
    if (page.preset !== 'dictionary') continue;
    for (const block of page.blocks) {
      if (block.type !== 'cards') continue;
      for (const id of block.items) ids.add(id);
    }
  }
  return ids;
}

function phrasesPageIds(pack: LessonPack): Set<string> {
  const ids = new Set<string>();
  for (const page of pack.pages) {
    if (page.preset !== 'phrases') continue;
    for (const block of page.blocks) {
      if (block.type !== 'cards') continue;
      for (const id of block.items) ids.add(id);
    }
  }
  return ids;
}

function questionTestIds(questions: Question[]): Set<string> {
  const ids = new Set<string>();
  for (const q of questions) {
    for (const t of q.tests ?? []) ids.add(String(t));
  }
  return ids;
}

function microIds(micro: Micro | undefined): Set<string> {
  const ids = new Set<string>();
  if (!micro) return ids;
  if (micro.morning?.phrase) ids.add(micro.morning.phrase);
  for (const id of micro.tool?.examples ?? []) ids.add(id);
  return ids;
}

/**
 * Coverage:
 * - every core word → dictionary cards AND (a question test OR micro ref)
 * - every core phrase/pattern → story/intro dialogue (pattern via derived .ex.N ok)
 */
export function checkItemCoverage(
  pack: LessonPack,
  opts: {
    coreItems: CoreItem[];
    items?: Item[];
    /** Prefer story document line ids when present. */
    storyLineIds?: string[][];
  },
): Issue[] {
  const issues: Issue[] = [];
  const core = opts.coreItems ?? [];
  if (!core.length) return issues;

  const inDict = dictionaryWordIds(pack);
  const inPhrases = phrasesPageIds(pack);
  const inStory = storyDialogueIds(pack, opts.storyLineIds);
  const inQ = questionTestIds(pack.questions ?? []);
  const inMicro = microIds(pack.micro);

  // Expand story set: derived example → parent pattern
  const storyPatterns = new Set<string>();
  for (const id of inStory) {
    const parent = parentPatternId(id);
    if (parent) storyPatterns.add(parent);
    if (id.startsWith('pattern.') && !parent) storyPatterns.add(id);
  }

  // variant_group: ≥1 member in story; others on phrases page
  const groups = new Map<string, CoreItem[]>();
  for (const c of core) {
    if (c.kind !== 'phrase' || !c.variant_group) continue;
    const list = groups.get(c.variant_group) ?? [];
    list.push(c);
    groups.set(c.variant_group, list);
  }
  const groupCoveredInStory = new Set<string>();
  for (const [group, members] of groups) {
    const inStoryMember = members.find((m) => inStory.has(m.id));
    if (!inStoryMember) {
      issues.push(
        issue(
          `variant_group.${group}`,
          'variant_group_uncovered',
          `variant_group ${group} needs ≥1 member in the story`,
          'error',
        ),
      );
    } else {
      groupCoveredInStory.add(group);
    }
    for (const m of members) {
      if (inStory.has(m.id)) continue;
      if (!inPhrases.has(m.id)) {
        issues.push(
          issue(
            `items[${m.id}]`,
            'phrase_not_on_phrases_page',
            `${m.id} (variant of ${group}) must appear on the phrases page`,
            'error',
          ),
        );
      }
    }
  }

  for (const c of core) {
    if (c.kind === 'word') {
      if (!inDict.has(c.id)) {
        issues.push(
          issue(
            `items[${c.id}]`,
            'word_not_in_dictionary',
            `${c.id} must appear on the dictionary cards`,
            'error',
          ),
        );
      }
      const practiced = inQ.has(c.id) || inMicro.has(c.id);
      if (!practiced) {
        issues.push(
          issue(
            `items[${c.id}]`,
            'word_not_practiced',
            `${c.id} needs ≥1 question or micro reference`,
            'warning',
          ),
        );
      }
      continue;
    }
    if (c.kind === 'phrase') {
      if (c.variant_group && groupCoveredInStory.has(c.variant_group)) {
        // Covered by group rule above
        continue;
      }
      if (c.variant_group) {
        // Group uncovered already reported
        continue;
      }
      if (!inStory.has(c.id)) {
        issues.push(
          issue(
            `items[${c.id}]`,
            'phrase_not_in_story',
            `${c.id} must appear in a story/intro dialogue line`,
            'error',
          ),
        );
      }
      continue;
    }
    if (c.kind === 'pattern') {
      const hit =
        storyPatterns.has(c.id) ||
        [...inStory].some((id) => id.startsWith(`${c.id}.ex.`));
      if (!hit) {
        issues.push(
          issue(
            `items[${c.id}]`,
            'pattern_not_in_story',
            `${c.id} (or a derived .ex.N) must appear in a story/intro dialogue`,
            'error',
          ),
        );
      }
    }
  }

  return issues;
}
