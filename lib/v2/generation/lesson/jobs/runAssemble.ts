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
import { runGenerationChecks } from '../generationChecks';
import { validateQuestionShapes } from '../questionChecks';
import { dedupeWritingAnswers, fillSkillQuota } from './runQuestions';

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
  /** Closed ref set: core ∪ recycle ∪ KNOWN. */
  allowedIds?: Iterable<string>;
  recycleIds?: string[];
  chatCharacter?: string;
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
  const fixedPages = (opts.pages ?? []).map((p) => {
    if (!p) return p;
    const fixed = fixDialoguePage(p, opts.items);
    return fixed.page;
  });
  for (const [pi, p] of fixedPages.entries()) {
    if (!p) continue;
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
        }),
        issues: fatals,
        warnings: [],
        flagged: true,
      };
    }
  }

  const quota = fillSkillQuota(opts.questions);
  const deduped = dedupeWritingAnswers(quota.questions);
  const pack = assembleLessonPack({
    day: opts.day,
    targetLang: opts.targetLang,
    outline,
    pagesByIndex: pagesMapFromSparse(fixedPages),
    questions: deduped.questions,
    micro: opts.micro,
    speak_prompts: opts.speak_prompts,
    recycleIds: opts.recycleIds,
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
  // Soften: treat former errors as warnings except core_id_missing
  const hard = new Set(['core_id_missing', 'dialogue_check']);
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
  ]);
  const issues: Issue[] = [];
  const warnings: Issue[] = [
    ...quota.warnings.map((w) => ({
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
  ];
  // Dictionary cards 6–12 warning
  for (const [pi, page] of pack.pages.entries()) {
    if (page.preset !== 'dictionary') continue;
    for (const [bi, block] of page.blocks.entries()) {
      if (block.type !== 'cards') continue;
      const n = block.items.length;
      if (n < 6 || n > 12) {
        warnings.push({
          path: `pages[${pi}].blocks[${bi}]`,
          rule: 'dictionary_cards',
          message: `dictionary cards should be 6–12, got ${n}`,
          severity: 'warning',
        });
      }
    }
  }
  for (const iss of [...validation.issues, ...genChecks, ...qChecks]) {
    if (hard.has(iss.rule) && iss.severity === 'error') {
      issues.push(iss);
    } else if (
      iss.rule === 'question_direction' ||
      iss.rule === 'writing_say_leak' ||
      iss.rule === 'duplicate_answer_tl'
    ) {
      // Keep as errors for admin visibility
      issues.push(iss);
    } else if (softRules.has(iss.rule) || iss.severity === 'warning') {
      warnings.push({ ...iss, severity: 'warning' });
    } else if (iss.severity === 'error') {
      // Default to WARNING per plan
      warnings.push({ ...iss, severity: 'warning' });
    } else {
      warnings.push(iss);
    }
  }
  const flagged = issues.length > 0 || warnings.length > 0;

  return { pack, issues, warnings, flagged };
}
