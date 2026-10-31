import type { Item } from '@/lib/v2/content/items';
import type { LessonPack, Micro, Question, SpeakPrompt } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import { validateLessonPack, type Issue } from '@/lib/v2/content/validate';
import { assembleLessonPack, pagesMapFromSparse } from '../stages/assemble';
import type { OutlineResult } from '../stages/types';
import {
  checkDialoguePage,
  fixDialoguePage,
} from '../dialogueChecks';
import { maxWordsForPhase } from '../brief';
import { phaseForDay } from '../buildRequest';
import { checkItemCoverage } from '../coverageChecks';
import type { CoreItem } from '../coreItems';
import { forceDictionaryWordCards, coreWordIds } from '../dictionaryWords';
import {
  forcePatternFormula,
  forcePhraseCards,
  orderPatternBlocks,
  patternIdForFormula,
  phraseIdsForCards,
} from '../pageCodeFill';
import { runGenerationChecks } from '../generationChecks';
import { validateQuestionShapes } from '../questionChecks';
import {
  dedupeTypeTests,
  dedupeWritingAnswers,
  fillSkillQuota,
  isPatternRootId,
  remapPatternTestId,
} from './runQuestions';

/** Rules that force dropping a question (path questions[N]…). */
const DROP_QUESTION_RULES = new Set([
  'question_options',
  'question_stimulus',
  'question_answer_index',
  'pattern_not_testable',
  'question_direction',
  'writing_say_leak',
  'question_accepted',
  'duplicate_answer_tl',
]);

/** Pack rules that stay hard errors (never softened). */
const HARD_PACK_RULES = new Set([
  'core_id_missing',
  'dialogue_check',
  'guided_step_count',
  'ask_density',
  'ask_early',
  'ask_too_early',
  'word_not_in_dictionary',
  'phrase_not_in_story',
  'pattern_not_in_story',
  'duplicate_ar',
  'duplicate_options',
  'ar_sentence_gap',
  'greeting_hello_collision',
  'slash_in_tl',
  'variant_group_uncovered',
  'phrase_not_on_phrases_page',
  'sections_explain_missing',
  'sections_explain_long',
  'sections_check_short',
  'sections_examples_short',
]);

function questionIndexFromPath(path: string): number | null {
  const m = path.match(/^questions\[(\d+)\]/);
  return m ? Number(m[1]) : null;
}

/** Remap bare pattern tests → derived examples before shape validation. */
function remapPatternQuestions(
  questions: Question[],
  items: Item[],
): { questions: Question[]; warnings: Issue[] } {
  const warnings: Issue[] = [];
  const out: Question[] = [];
  for (const q of questions) {
    const tests = Array.isArray(q.tests) ? q.tests : [];
    const first = String(tests[0] ?? '');
    if (!isPatternRootId(first)) {
      out.push(q);
      continue;
    }
    if (q.type === 'choose_article') {
      out.push(q);
      continue;
    }
    const remapped = remapPatternTestId(first, items);
    if (!remapped) {
      warnings.push({
        path: q.id,
        rule: 'pattern_not_testable',
        message: `dropped question testing pattern root ${first}`,
        severity: 'warning',
      });
      continue;
    }
    out.push({ ...q, tests: [remapped, ...tests.slice(1)] });
  }
  return { questions: out, warnings };
}

/**
 * Drop questions that fail shape rules; return filtered list + drop warnings.
 */
export function dropInvalidQuestions(
  questions: Question[],
  shapeIssues: Issue[],
): { questions: Question[]; warnings: Issue[] } {
  const dropIdx = new Set<number>();
  for (const iss of shapeIssues) {
    if (iss.severity !== 'error') continue;
    if (!DROP_QUESTION_RULES.has(iss.rule)) continue;
    const idx = questionIndexFromPath(iss.path);
    if (idx != null) dropIdx.add(idx);
  }
  if (!dropIdx.size) return { questions, warnings: [] };
  const warnings: Issue[] = [];
  const kept: Question[] = [];
  for (const [i, q] of questions.entries()) {
    if (dropIdx.has(i)) {
      warnings.push({
        path: q.id,
        rule: 'question_dropped',
        message: `auto-dropped invalid question (${[...shapeIssues]
          .filter((s) => questionIndexFromPath(s.path) === i)
          .map((s) => s.rule)
          .join(', ')})`,
        severity: 'warning',
      });
      continue;
    }
    kept.push(q);
  }
  return { questions: kept, warnings };
}

export function runAssembleJob(opts: {
  day: number;
  targetLang?: string;
  outline: OutlineResult;
  items: Item[];
  pages: (Page | null | undefined)[];
  questions: Question[];
  micro?: Micro;
  speak_prompts?: SpeakPrompt[];
  /** Required core ids that must appear in the bank. */
  coreIds?: string[];
  /** Full core rows (for coverage + dictionary word list). */
  coreItems?: CoreItem[];
  /** Closed ref set: core ∪ recycle ∪ KNOWN. */
  allowedIds?: Iterable<string>;
  recycleIds?: string[];
  chatCharacter?: string;
  storyId?: string;
  storyLineIds?: string[][];
}): {
  pack: LessonPack;
  issues: Issue[];
  warnings: Issue[];
  flagged: boolean;
} {
  const outline: OutlineResult = {
    ...opts.outline,
    items: opts.items,
  };
  const maxWords = maxWordsForPhase(phaseForDay(opts.day));
  const wordIds =
    opts.coreItems != null
      ? coreWordIds(opts.coreItems)
      : opts.items.filter((i) => i.type === 'word').map((i) => i.id);
  const fixedPages = (opts.pages ?? []).map((p, pi) => {
    if (!p) return p;
    const fixed = fixDialoguePage(p, opts.items);
    let page = fixed.page;
    const entry =
      opts.outline.pages.find((e) => e.index === pi) ?? opts.outline.pages[pi];
    if (page.preset === 'dictionary') {
      page = forceDictionaryWordCards(page, wordIds);
    }
    if (page.preset === 'phrases') {
      page = forcePhraseCards(
        page,
        phraseIdsForCards(entry?.introduces ?? [], [
          ...(entry?.introduces ?? []),
          ...(entry?.assumes ?? []),
        ]),
      );
    }
    if (page.preset === 'pattern') {
      const patternId = patternIdForFormula(entry?.introduces ?? []);
      if (patternId) page = forcePatternFormula(page, patternId);
      page = orderPatternBlocks(page);
    }
    return page;
  });
  for (const [pi, p] of fixedPages.entries()) {
    if (!p) continue;
    // Story pointer pages have no embedded dialogue — checked on v2_stories.
    if (p.story_id || (p.preset === 'story' && !p.blocks.some((b) => b.type === 'dialogue'))) {
      continue;
    }
    const dlg = checkDialoguePage({
      page: p,
      items: opts.items,
      recycleIds: opts.recycleIds,
      maxWords,
      day: opts.day,
      chatCharacter: opts.chatCharacter,
    });
    if (dlg.length) {
      // Fatal: never publish a dialogue with failing code checks
      const fatals: Issue[] = dlg.map((d) => ({
        path: `pages[${pi}].${d.path ?? 'dialogue'}`,
        rule: 'dialogue_check',
        message: d.message,
        severity: 'error' as const,
      }));
      return {
        pack: assembleLessonPack({
          day: opts.day,
          targetLang: opts.targetLang,
          outline,
          pagesByIndex: pagesMapFromSparse(fixedPages),
          questions: opts.questions,
          micro: opts.micro,
          speak_prompts: opts.speak_prompts,
          recycleIds: opts.recycleIds,
          storyId: opts.storyId,
        }),
        issues: fatals,
        warnings: [],
        flagged: true,
      };
    }
  }

  const remapped = remapPatternQuestions(opts.questions, opts.items);
  const quota = fillSkillQuota(remapped.questions);
  const typeDeduped = dedupeTypeTests(quota.questions);
  const deduped = dedupeWritingAnswers(typeDeduped.questions);

  // Pre-drop pass: validate shapes, drop invalids, then assemble
  const preShape = validateQuestionShapes(
    deduped.questions as unknown as Array<Record<string, unknown>>,
    opts.items,
  );
  const dropped = dropInvalidQuestions(deduped.questions, preShape);

  let pack = assembleLessonPack({
    day: opts.day,
    targetLang: opts.targetLang,
    outline: {
      ...outline,
      lesson: {
        ...outline.lesson,
        ...(opts.storyId ? { story_id: opts.storyId } : {}),
      },
    },
    pagesByIndex: pagesMapFromSparse(fixedPages),
    questions: dropped.questions,
    micro: opts.micro,
    speak_prompts: opts.speak_prompts,
    recycleIds: opts.recycleIds,
    storyId: opts.storyId,
  });

  const validation = validateLessonPack(pack, {
    mode: 'strict',
    coreIds: opts.coreIds,
    allowedIds: opts.allowedIds,
  });
  const genChecks = runGenerationChecks(pack);
  const qChecks = validateQuestionShapes(
    pack.questions as unknown as Array<Record<string, unknown>>,
    opts.items,
  );
  const coverage = checkItemCoverage(pack, {
    coreItems: opts.coreItems ?? [],
    items: opts.items,
    storyLineIds: opts.storyLineIds,
  });

  const softRules = new Set([
    'rt_segment_lang',
    'raw_mixed_string',
    'arabic_register',
    'brazilian',
    'sentence_length',
    'unknown_item_ref',
    'bad_distractor',
    'pages_count',
    'dictionary_cards',
    'question_dropped',
    'skill_quota',
  ]);
  const issues: Issue[] = [];

  // Unique meanings: two same-day items must not share normalized ar
  const arOwners = new Map<string, string>();
  for (const item of pack.items) {
    const ar =
      'ar' in item && typeof item.ar === 'string' ? item.ar.trim() : '';
    if (!ar || ar === '…') continue;
    const key = ar
      .replace(/[،,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const prev = arOwners.get(key);
    if (prev && prev !== item.id) {
      issues.push({
        path: `items[${item.id}].ar`,
        rule: 'duplicate_ar',
        message: `${item.id} shares ar with ${prev}`,
        severity: 'error',
      });
    } else {
      arOwners.set(key, item.id);
    }
  }

  // Slash hygiene on item / option labels
  for (const item of pack.items) {
    const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    if (tl.includes('/')) {
      issues.push({
        path: `items[${item.id}].tl`,
        rule: 'slash_in_tl',
        message: `${item.id} tl contains "/" — use variant_tl[]`,
        severity: 'error',
      });
    }
  }
  for (const [qi, q] of pack.questions.entries()) {
    const optsList = Array.isArray(q.options) ? q.options : [];
    const norms = new Map<string, number>();
    for (const [oi, opt] of optsList.entries()) {
      const label =
        typeof opt === 'string'
          ? opt
          : opt && typeof opt === 'object' && 'label' in opt
            ? String((opt as { label: unknown }).label ?? '')
            : opt && typeof opt === 'object' && 'text' in opt
              ? String((opt as { text: unknown }).text ?? '')
              : '';
      if (label.includes('/')) {
        issues.push({
          path: `questions[${qi}].options[${oi}]`,
          rule: 'slash_in_tl',
          message: 'option label must not contain "/"',
          severity: 'error',
        });
      }
      const n = label
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!n) continue;
      if (norms.has(n)) {
        issues.push({
          path: `questions[${qi}].options`,
          rule: 'duplicate_options',
          message: `question ${q.id} has duplicate options after normalize`,
          severity: 'error',
        });
        break;
      }
      norms.set(n, oi);
    }
  }

  const warnings: Issue[] = [
    ...remapped.warnings,
    ...quota.warnings.map((w) => ({
      path: w.path,
      rule: w.rule,
      message: w.message,
      severity: 'warning' as const,
    })),
    ...typeDeduped.warnings.map((w) => ({
      path: w.path,
      rule: w.rule,
      message: w.message,
      severity: 'warning' as const,
    })),
    ...deduped.warnings.map((w) => ({
      path: w.path,
      rule: w.rule,
      message: w.message,
      severity: 'warning' as const,
    })),
    ...dropped.warnings,
  ];
  // Trim scene hotspots to ≤8 (strict validate)
  pack = {
    ...pack,
    pages: pack.pages.map((page) => {
      if (page.preset !== 'scene') return page;
      return {
        ...page,
        blocks: page.blocks.map((block) => {
          if (block.type !== 'scene') return block;
          const hotspots = Array.isArray(
            (block as { hotspots?: unknown[] }).hotspots,
          )
            ? (block as { hotspots: unknown[] }).hotspots.slice(0, 8)
            : (block as { hotspots?: unknown[] }).hotspots;
          return { ...block, hotspots };
        }) as Page['blocks'],
      };
    }),
  };

  // Dictionary cards: all day words (1–20); warn if empty or over hard cap
  for (const [pi, page] of pack.pages.entries()) {
    if (page.preset !== 'dictionary') continue;
    for (const [bi, block] of page.blocks.entries()) {
      if (block.type !== 'cards') continue;
      const n = block.items.length;
      if (n < 1 || n > 20) {
        warnings.push({
          path: `pages[${pi}].blocks[${bi}]`,
          rule: 'dictionary_cards',
          message: `dictionary cards should be 1–20 (all day words), got ${n}`,
          severity: 'warning',
        });
      }
    }
  }
  for (const iss of [
    ...validation.issues,
    ...genChecks,
    ...qChecks,
    ...coverage,
  ]) {
    if (HARD_PACK_RULES.has(iss.rule) && iss.severity === 'error') {
      issues.push(iss);
    } else if (DROP_QUESTION_RULES.has(iss.rule) && iss.severity === 'error') {
      // Survived drop pass — keep hard
      issues.push(iss);
    } else if (
      iss.rule === 'word_not_practiced' ||
      softRules.has(iss.rule) ||
      iss.severity === 'warning'
    ) {
      warnings.push({ ...iss, severity: 'warning' });
    } else if (iss.severity === 'error') {
      warnings.push({ ...iss, severity: 'warning' });
    } else {
      warnings.push(iss);
    }
  }
  const flagged = issues.length > 0 || warnings.length > 0;

  return { pack, issues, warnings, flagged };
}
