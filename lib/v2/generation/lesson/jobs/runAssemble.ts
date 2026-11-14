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
  forceVocabFlowCards,
  orderPatternBlocks,
  patternIdForFormula,
  phraseIdsForCards,
} from '../pageCodeFill';
import { runGenerationChecks } from '../generationChecks';
import { validateQuestionShapes } from '../questionChecks';
import {
  buildRealWorldPage,
  realWorldPhrasesToItems,
  tipToRt,
  type RealWorldHandoff,
} from '../realWorldBuild';
import { orderFlowContent } from '@/lib/v2/vocabFlow/orderItems';
import {
  ensureTambemAr,
  normalizeArPunctuation,
} from '../storyCodeEnrich';
import {
  buildMcqOptions,
  dedupeTypeTests,
  dedupeWritingAnswers,
  fillSkillQuota,
  isPatternRootId,
  remapPatternTestId,
} from './runQuestions';

/** Merge RW phrase ids + tip into the vocab_flow page (new lessons). */
function weaveRealWorldIntoVocabFlow(
  pages: (Page | null | undefined)[],
  outline: OutlineResult,
  handoff: RealWorldHandoff,
  opts?: {
    flow?: string[] | null;
    items?: Item[];
  },
): (Page | null | undefined)[] {
  const vocabOutlineIdx = outline.pages.findIndex(
    (p) => p.preset === 'vocab_flow',
  );
  if (vocabOutlineIdx < 0) return pages;
  const next = [...pages];
  while (next.length <= vocabOutlineIdx) next.push(null);
  const page = next[vocabOutlineIdx];
  if (!page || page.preset !== 'vocab_flow') return pages;

  const rwIds = handoff.phrases.map((p) => p.id);
  const blocks = page.blocks.map((b) => {
    if (b.type !== 'cards') return b;
    const existing = Array.isArray(b.items) ? [...b.items] : [];
    const candidateIds = [...new Set([...existing, ...rwIds])];
    const orderItems = (opts?.items ?? []).map((i) => ({
      id: i.id,
      type: i.type,
      tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : undefined,
      uses: (i as { uses?: string[] }).uses,
      real_world: Boolean((i as { real_world?: boolean }).real_world),
    }));
    for (const p of handoff.phrases) {
      if (!orderItems.some((o) => o.id === p.id)) {
        orderItems.push({
          id: p.id,
          type: 'phrase',
          tl: p.tl,
          uses: (p as { uses?: string[] }).uses,
          real_world: true,
        });
      }
    }
    const ordered = orderFlowContent({
      flow: opts?.flow?.length ? opts.flow : undefined,
      rwIds,
      candidateIds,
      items: orderItems,
    });
    return { ...b, items: ordered.length ? ordered : candidateIds };
  });

  const withoutOldRwTip = blocks.filter(
    (b) => !(b.type === 'tip' && b.id === 'tip_rw'),
  );
  const tip = handoff.tip;
  const hasTip =
    Boolean(tip.body_eg?.trim()) ||
    Boolean(tip.wrong_tl?.trim() && tip.right_tl?.trim());
  if (hasTip) {
    const tipRt = tipToRt(tip);
    const tipExplainsId =
      handoff.phrases.find((p) => {
        const n = p.tl.toLowerCase();
        const wrong = tip.wrong_tl?.toLowerCase() ?? '';
        const right = tip.right_tl?.toLowerCase() ?? '';
        return (
          (wrong && n.includes(wrong)) || (right && n.includes(right))
        );
      })?.id ?? handoff.phrases[handoff.phrases.length - 1]?.id;

    withoutOldRwTip.push({
      id: 'tip_rw',
      type: 'tip' as const,
      kind: 'culture' as const,
      title: tipRt.title,
      body: tipRt.body,
      ...(tipExplainsId ? { after_item_id: tipExplainsId } : {}),
    });
  }

  next[vocabOutlineIdx] = { ...page, blocks: withoutOldRwTip };
  return next;
}

/** Optionally remap one listen_meaning slot onto a real-world phrase. */
/** Strip or inject the code-built real_world page; merge rw items. */
export function applyRealWorldToAssemble(opts: {
  outline: OutlineResult;
  pages: (Page | null | undefined)[];
  items: Item[];
  questions: Question[];
  handoff: RealWorldHandoff | null | undefined;
  situationEg?: string;
  situationTl?: string;
  /** Authored core-items flow (ids + rw:N). */
  flow?: string[] | null;
}): {
  outline: OutlineResult;
  pages: (Page | null | undefined)[];
  items: Item[];
  questions: Question[];
  warnings: Issue[];
} {
  const warnings: Issue[] = [];
  const rwIdx = opts.outline.pages.findIndex((p) => p.preset === 'real_world');
  const vocabIdx = opts.outline.pages.findIndex(
    (p) => p.preset === 'vocab_flow',
  );
  const hide =
    !opts.handoff || opts.handoff.hide || opts.handoff.phrases.length < 3;

  // New lessons: weave into vocab_flow (no separate real_world page).
  if (rwIdx < 0 && vocabIdx >= 0) {
    if (hide) {
      warnings.push({
        path: 'pages',
        rule: 'real_world_hidden',
        message: 'real_world phrases skipped (<3 or job skipped)',
        severity: 'warning',
      });
      return {
        outline: opts.outline,
        pages: opts.pages,
        items: opts.items,
        questions: opts.questions,
        warnings,
      };
    }
    const existing = new Set(opts.items.map((i) => i.id));
    const rwItems = realWorldPhrasesToItems(opts.handoff!.phrases).filter(
      (i) => !existing.has(i.id),
    );
    const items = [...opts.items, ...rwItems];
    const pages = weaveRealWorldIntoVocabFlow(
      opts.pages,
      opts.outline,
      opts.handoff!,
      { flow: opts.flow, items },
    );
    warnings.push({
      path: 'pages',
      rule: 'real_world_woven',
      message: `wove ${opts.handoff!.phrases.length} real_world phrases into vocab_flow`,
      severity: 'warning',
    });
    return {
      outline: opts.outline,
      pages,
      items,
      questions: opts.questions,
      warnings,
    };
  }

  if (rwIdx < 0) {
    return {
      outline: opts.outline,
      pages: opts.pages,
      items: opts.items,
      questions: opts.questions,
      warnings,
    };
  }

  if (hide) {
    const pagesPlan = opts.outline.pages.filter((p) => p.preset !== 'real_world');
    const renumbered = pagesPlan.map((p, i) => ({
      ...p,
      index: i,
      page_id: `p${i}_${p.preset}`,
    }));
    // Drop the sparse page slot and shift later pages left
    const sparse = [...opts.pages];
    if (rwIdx < sparse.length) sparse.splice(rwIdx, 1);
    warnings.push({
      path: 'pages',
      rule: 'real_world_hidden',
      message: 'real_world page hidden (<3 phrases or job skipped)',
      severity: 'warning',
    });
    return {
      outline: { ...opts.outline, pages: renumbered },
      pages: sparse,
      items: opts.items,
      questions: opts.questions,
      warnings,
    };
  }

  const entry = opts.outline.pages[rwIdx]!;
  const built = buildRealWorldPage({
    index: entry.index,
    pageId: entry.page_id,
    titleEg: entry.title || 'بيقولوها كده',
    situationEg: opts.situationEg,
    situationTl: opts.situationTl,
    handoff: opts.handoff!,
  });
  const pages = [...opts.pages];
  while (pages.length <= rwIdx) pages.push(null);
  pages[rwIdx] = built;

  const existing = new Set(opts.items.map((i) => i.id));
  const rwItems = realWorldPhrasesToItems(opts.handoff!.phrases).filter(
    (i) => !existing.has(i.id),
  );
  const items = [...opts.items, ...rwItems];

  return {
    outline: opts.outline,
    pages,
    items,
    questions: opts.questions,
    warnings,
  };
}

/**
 * Rules that force dropping a question (path questions[N]…).
 * Option-shape issues are rebuilt in place — never drop a planned slot for them.
 */
/** Hard drops only — never for duplicate answer_tl (planned slots must ship). */
const DROP_QUESTION_RULES = new Set([
  'question_stimulus',
  'pattern_not_testable',
  'question_accepted',
]);

/** Option issues that should trigger a rebuild warning instead of a drop. */
const REBUILD_OPTION_RULES = new Set([
  'question_options',
  'question_answer_index',
  'question_direction',
  'writing_say_leak',
  'duplicate_arabic_options',
  'variant_group_distractor',
]);

/**
 * Pack rules that stay hard errors (never softened).
 * Content pedagogy → warnings unless 00 marks them fatal (skill quotas live on questions job).
 */
const HARD_PACK_RULES = new Set([
  'core_id_missing',
  'sections_explain_missing',
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
 * Rebuild MCQ options for a question that failed option-shape checks.
 * Returns the question unchanged when rebuild isn't applicable.
 */
export function rebuildQuestionOptions(
  question: Question,
  items: Item[],
): { question: Question; rebuilt: boolean } {
  const type = String(question.type ?? '');
  const tests = Array.isArray(question.tests) ? question.tests.map(String) : [];
  const testsId = tests[0] ?? '';
  const tested = items.find((i) => i.id === testsId);
  if (!tested) return { question, rebuilt: false };

  const meaningTypes = new Set([
    'listen_meaning',
    'listen_pick_image',
    'read_meaning',
  ]);
  const tlTypes = new Set(['listen_pick_tl', 'situation_choice']);
  if (!meaningTypes.has(type) && !tlTypes.has(type)) {
    return { question, rebuilt: false };
  }

  const kind = meaningTypes.has(type) ? 'meaning' : 'tl';
  const mcq = buildMcqOptions(tested, items, kind, '');
  let options = mcq.options;
  let answer = mcq.answer;
  // situation_choice is a 3-option TL MCQ
  if (type === 'situation_choice' && options.length > 3) {
    const correct = options[answer];
    const rest = options.filter((_, i) => i !== answer).slice(0, 2);
    options = [correct!, ...rest];
    answer = 0;
  }
  return {
    question: {
      ...question,
      options,
      answer,
    },
    rebuilt: true,
  };
}

/**
 * Drop questions that fail hard shape rules; rebuild options for option issues
 * so planned slots are never removed for distractor problems.
 */
export function dropInvalidQuestions(
  questions: Question[],
  shapeIssues: Issue[],
  items?: Item[],
): { questions: Question[]; warnings: Issue[] } {
  const dropIdx = new Set<number>();
  const rebuildIdx = new Set<number>();
  for (const iss of shapeIssues) {
    if (iss.severity !== 'error') continue;
    const idx = questionIndexFromPath(iss.path);
    if (idx == null) continue;
    if (REBUILD_OPTION_RULES.has(iss.rule)) {
      rebuildIdx.add(idx);
      continue;
    }
    if (DROP_QUESTION_RULES.has(iss.rule)) dropIdx.add(idx);
  }
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
    if (rebuildIdx.has(i) && items?.length) {
      const { question: next, rebuilt } = rebuildQuestionOptions(q, items);
      const opts = Array.isArray(next.options) ? next.options : [];
      if (rebuilt && opts.length >= 2) {
        warnings.push({
          path: q.id,
          rule: 'options_rebuilt',
          message: `rebuilt options after shape check (${[...shapeIssues]
            .filter((s) => questionIndexFromPath(s.path) === i)
            .map((s) => s.rule)
            .join(', ')})`,
          severity: 'warning',
        });
        kept.push(next);
        continue;
      }
      // Rebuild failed — fall through to drop only if still unrecoverable
      warnings.push({
        path: q.id,
        rule: 'question_dropped',
        message: `auto-dropped invalid question after failed option rebuild`,
        severity: 'warning',
      });
      continue;
    }
    if (rebuildIdx.has(i) && !items?.length) {
      // No bank to rebuild from — keep prior drop behaviour for empty options
      const opts = Array.isArray(q.options) ? q.options : [];
      if (opts.length < 2) {
        warnings.push({
          path: q.id,
          rule: 'question_dropped',
          message: `auto-dropped invalid question (no items to rebuild options)`,
          severity: 'warning',
        });
        continue;
      }
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
  /** Soft real_world handoff (may be null/hidden). */
  realWorld?: RealWorldHandoff | null;
  situationEg?: string;
  situationTl?: string;
  /** Authored core-items `flow` (ids + rw:N). */
  flow?: string[] | null;
}): {
  pack: LessonPack;
  issues: Issue[];
  warnings: Issue[];
  flagged: boolean;
} {
  const rwApplied = applyRealWorldToAssemble({
    outline: opts.outline,
    pages: opts.pages ?? [],
    items: opts.items,
    questions: opts.questions,
    handoff: opts.realWorld,
    situationEg: opts.situationEg,
    situationTl: opts.situationTl,
    flow: opts.flow,
  });
  const outline: OutlineResult = {
    ...rwApplied.outline,
    items: rwApplied.items,
  };
  const maxWords = maxWordsForPhase(phaseForDay(opts.day));
  const wordIds =
    opts.coreItems != null
      ? coreWordIds(opts.coreItems)
      : rwApplied.items.filter((i) => i.type === 'word').map((i) => i.id);
  const fixedPages = (rwApplied.pages ?? []).map((p, pi) => {
    if (!p) return p;
    const fixed = fixDialoguePage(p, opts.items);
    let page = fixed.page;
    const entry =
      outline.pages.find((e) => e.index === pi) ?? outline.pages[pi];
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
    if (page.preset === 'vocab_flow') {
      const vocabIds = (entry?.introduces ?? []).filter(
        (id) =>
          id.startsWith('word.') ||
          id.startsWith('phrase.') ||
          (/^verb\.[a-z_]+$/i.test(id) && !id.includes(':')),
      );
      const rwIds = rwApplied.items
        .filter((i) => Boolean((i as { real_world?: boolean }).real_world))
        .map((i) => i.id);
      const existingCardIds = page.blocks.flatMap((b) =>
        b.type === 'cards' && Array.isArray(b.items)
          ? (b.items as string[])
          : [],
      );
      const base = vocabIds.length ? vocabIds : wordIds;
      const candidateIds = [
        ...new Set([...existingCardIds, ...base, ...rwIds]),
      ].filter((id) => {
        if (base.includes(id) || rwIds.includes(id)) return true;
        return Boolean(
          (rwApplied.items.find((i) => i.id === id) as
            | { real_world?: boolean }
            | undefined)?.real_world,
        );
      });
      // Prefer card order from weave (already flow-resolved); else compute.
      const merged =
        opts.flow?.length || existingCardIds.some((id) => rwIds.includes(id))
          ? existingCardIds.length
            ? existingCardIds.filter((id) => candidateIds.includes(id))
            : orderFlowContent({
                flow: opts.flow ?? undefined,
                rwIds,
                candidateIds,
                items: rwApplied.items.map((i) => ({
                  id: i.id,
                  type: i.type,
                  tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : undefined,
                  uses: (i as { uses?: string[] }).uses,
                  real_world: Boolean(
                    (i as { real_world?: boolean }).real_world,
                  ),
                })),
              })
          : orderFlowContent({
              candidateIds,
              items: rwApplied.items.map((i) => ({
                id: i.id,
                type: i.type,
                tl: 'tl' in i && typeof i.tl === 'string' ? i.tl : undefined,
                uses: (i as { uses?: string[] }).uses,
                real_world: Boolean(
                  (i as { real_world?: boolean }).real_world,
                ),
              })),
            });
      page = forceVocabFlowCards(
        page,
        merged.length ? merged : base.length ? base : candidateIds,
      );
    }
    if (page.preset === 'pattern') {
      const patternId = patternIdForFormula(entry?.introduces ?? []);
      if (patternId) page = forcePatternFormula(page, patternId);
      page = orderPatternBlocks(page);
    }
    return page;
  });
  const dialogueIssues: Issue[] = [];
  for (const [pi, p] of fixedPages.entries()) {
    if (!p) continue;
    // Story pointer pages have no embedded dialogue — checked on v2_stories.
    if (p.story_id || (p.preset === 'story' && !p.blocks.some((b) => b.type === 'dialogue'))) {
      continue;
    }
    const dlg = checkDialoguePage({
      page: p,
      items: rwApplied.items,
      recycleIds: opts.recycleIds,
      maxWords,
      day: opts.day,
      chatCharacter: opts.chatCharacter,
    });
    // Structure: empty dialogue / unknown speaker. Content nits → review warnings.
    for (const d of dlg) {
      const isStruct =
        /no dialogue|empty dialogue|0 lines|missing lines/i.test(d.message) ||
        (/unknown speaker/i.test(d.message) &&
          (d.path?.endsWith('.speaker') ?? false));
      dialogueIssues.push({
        path: `pages[${pi}].${d.path ?? 'dialogue'}`,
        rule: 'dialogue_check',
        message: d.message,
        severity: isStruct ? 'error' : 'warning',
      });
    }
  }

  const remapped = remapPatternQuestions(
    rwApplied.questions,
    rwApplied.items,
  );
  const quota = fillSkillQuota(remapped.questions);
  const typeDeduped = dedupeTypeTests(quota.questions);
  const deduped = dedupeWritingAnswers(typeDeduped.questions);

  // Pre-drop pass: validate shapes, drop invalids, then assemble
  const preShape = validateQuestionShapes(
    deduped.questions as unknown as Array<Record<string, unknown>>,
    rwApplied.items,
  );
  const dropped = dropInvalidQuestions(
    deduped.questions,
    preShape,
    rwApplied.items,
  );

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

  // Normalize ar punctuation (۔ → .) and também → أيضًا on item meanings.
  pack = {
    ...pack,
    items: pack.items.map((item) => {
      if (!('ar' in item) || typeof item.ar !== 'string') return item;
      const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
      let ar = normalizeArPunctuation(item.ar);
      ar = ensureTambemAr(tl, ar);
      if (ar === item.ar) return item;
      return { ...item, ar };
    }),
  };

  // Expand allowedIds with real_world phrase ids so refs aren't unknown.
  const allowedWithRw = new Set<string>([
    ...(opts.allowedIds ? [...opts.allowedIds] : []),
    ...rwApplied.items
      .filter((i) => (i as { real_world?: boolean }).real_world)
      .map((i) => i.id),
  ]);

  const validation = validateLessonPack(pack, {
    mode: 'strict',
    coreIds: opts.coreIds,
    allowedIds: allowedWithRw,
  });
  const genChecks = runGenerationChecks(pack);
  const qChecks = validateQuestionShapes(
    pack.questions as unknown as Array<Record<string, unknown>>,
    rwApplied.items,
  );
  const coverage = checkItemCoverage(pack, {
    coreItems: opts.coreItems ?? [],
    items: rwApplied.items,
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
    'duplicate_ar',
    'slash_in_tl',
    'slash_in_ar',
    'duplicate_options',
    'options_rebuilt',
    'dialogue_check',
    'word_not_in_dictionary',
    'phrase_not_in_story',
    'pattern_not_in_story',
    'ar_missing',
    'greeting_hello_collision',
    'variant_group_uncovered',
    'phrase_not_on_phrases_page',
    'sections_explain_long',
    'sections_check_short',
    'sections_examples_short',
    'guided_step_count',
    'ask_density',
    'ask_early',
    'ask_too_early',
    'real_world_hidden',
    'real_world_woven',
    'ar_punctuation',
  ]);
  const issues: Issue[] = [];
  const earlyWarnings: Issue[] = [...rwApplied.warnings];

  // Unique meanings: two same-day items must not share normalized ar (warning)
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
      earlyWarnings.push({
        path: `items[${item.id}].ar`,
        rule: 'duplicate_ar',
        message: `${item.id} shares ar with ${prev}`,
        severity: 'warning',
      });
    } else {
      arOwners.set(key, item.id);
    }
  }

  // Slash hygiene on item / option labels (warning — content)
  for (const item of pack.items) {
    const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
    if (tl.includes('/')) {
      earlyWarnings.push({
        path: `items[${item.id}].tl`,
        rule: 'slash_in_tl',
        message: `${item.id} tl contains "/" — use variant_tl[]`,
        severity: 'warning',
      });
    }
    const ar = 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
    const ar_f =
      'ar_f' in item && typeof item.ar_f === 'string' ? item.ar_f : '';
    if (ar.includes('/')) {
      earlyWarnings.push({
        path: `items[${item.id}].ar`,
        rule: 'slash_in_ar',
        message: `${item.id} ar contains "/" — use a single MSA meaning`,
        severity: 'warning',
      });
    }
    if (ar_f.includes('/')) {
      earlyWarnings.push({
        path: `items[${item.id}].ar_f`,
        rule: 'slash_in_ar',
        message: `${item.id} ar_f contains "/"`,
        severity: 'warning',
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
        earlyWarnings.push({
          path: `questions[${qi}].options[${oi}]`,
          rule: 'slash_in_tl',
          message: 'option label must not contain "/"',
          severity: 'warning',
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
        earlyWarnings.push({
          path: `questions[${qi}].options`,
          rule: 'duplicate_options',
          message: `question ${q.id} has duplicate options after normalize`,
          severity: 'warning',
        });
        break;
      }
      norms.set(n, oi);
    }
  }

  const warnings: Issue[] = [
    ...earlyWarnings,
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
    ...dialogueIssues.filter((i) => i.severity === 'warning'),
  ];
  for (const d of dialogueIssues.filter((i) => i.severity === 'error')) {
    issues.push(d);
  }
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

  // Dictionary / vocab_flow cards: warn if empty or over hard cap
  for (const [pi, page] of pack.pages.entries()) {
    if (page.preset !== 'dictionary' && page.preset !== 'vocab_flow') continue;
    for (const [bi, block] of page.blocks.entries()) {
      if (block.type !== 'cards') continue;
      const n = block.items.length;
      const max = page.preset === 'vocab_flow' ? 28 : 20;
      if (n < 1 || n > max) {
        warnings.push({
          path: `pages[${pi}].blocks[${bi}]`,
          rule: 'dictionary_cards',
          message: `${page.preset} cards should be 1–${max}, got ${n}`,
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
