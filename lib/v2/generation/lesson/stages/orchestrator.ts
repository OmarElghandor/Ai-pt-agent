import type { LessonPack, Micro, SpeakPrompt } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import {
  hasErrors,
  validateLessonPack,
  type Issue,
} from '@/lib/v2/content/validate';
import {
  buildDayCost,
  printTimingTable,
  sumUsage,
  type CallTiming,
  type DayCost,
} from '../cost';
import { runGenerationChecks } from '../generationChecks';
import {
  getLessonVersion,
  saveDraft,
  updateDraft,
  type GenerationMeta,
  type SavedLesson,
} from '../save';
import { assembleLessonPack, pagesMapFromSparse } from './assemble';
import { runContinuityPass } from './continuity';
import { runOutlineStage, validateOutline } from './outline';
import { runPageStage } from './page';
import { mapPool } from './pool';
import { runQuestionsStage } from './questions';
import {
  emptyStages,
  PAGE_CONCURRENCY,
  type GenerationStages,
  type OutlineResult,
  type PartialLessonData,
} from './types';

export type OrchestratorResult = {
  saved: SavedLesson;
  pack: LessonPack;
  issues: Issue[];
  warnings: Issue[];
  flagged: boolean;
  cost: DayCost;
  attempts: number;
  timings: CallTiming[];
  stages: GenerationStages;
};

export type OrchestratorOptions = {
  day: number;
  targetLang?: string;
  /** Resume an existing draft version. */
  version?: number;
  /** Create a new draft version (default when version omitted). */
  forceNew?: boolean;
  onProgress?: (stages: GenerationStages, timings: CallTiming[]) => void | Promise<void>;
};

function partialFromOutline(outline: OutlineResult, day: number, targetLang: string): PartialLessonData {
  const sorted = [...outline.pages].sort((a, b) => a.index - b.index);
  return {
    outline,
    items: outline.items,
    pages: sorted.map(() => null),
    questions: [],
    lesson: {
      id: outline.lesson?.id ?? `${targetLang}.d${String(day).padStart(2, '0')}`,
      target_lang: outline.lesson?.target_lang ?? targetLang,
      day: outline.lesson?.day ?? day,
      phase: outline.lesson?.phase,
      week: outline.lesson?.week,
      kind: outline.lesson?.kind ?? 'lesson',
      situation: outline.lesson?.situation,
      can_do: outline.lesson?.can_do,
      pages: sorted.map((p) => p.page_id),
    },
  };
}

async function persist(
  day: number,
  targetLang: string,
  version: number,
  data: PartialLessonData | LessonPack,
  meta: GenerationMeta,
  onProgress?: OrchestratorOptions['onProgress'],
): Promise<SavedLesson> {
  const saved = await updateDraft({
    day,
    targetLang,
    version,
    pack: data,
    meta,
    mergeMeta: true,
  });
  if (meta.stages && onProgress) {
    await onProgress(meta.stages, meta.timing ?? []);
  }
  return saved;
}

/**
 * Resumable staged generation: outline → pages∥questions → continuity → strict validate.
 */
export async function runStagedGeneration(
  opts: OrchestratorOptions,
): Promise<OrchestratorResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const day = opts.day;
  const wallStart = Date.now();

  let version = opts.version;
  let stages: GenerationStages;
  let outline: OutlineResult | undefined;
  let pagesSparse: (Page | null)[] = [];
  let questions: LessonPack['questions'] = [];
  let micro: Micro | undefined;
  let speak_prompts: SpeakPrompt[] | undefined;
  let timings: CallTiming[] = [];
  let model = 'unknown';
  let attempts = 0;
  let data: PartialLessonData = {};

  if (version != null && !opts.forceNew) {
    const existing = await getLessonVersion(day, version, targetLang);
    if (!existing) {
      throw new Error(`No draft to resume: day ${day} v${version}`);
    }
    const meta = existing.meta ?? {};
    stages = meta.stages ?? emptyStages();
    // Fresh timing log for this run (prior calls stay on older meta snapshots in Mongo history)
    timings = [];
    outline = meta.outline ?? (existing.data as PartialLessonData).outline;
    data = existing.data as PartialLessonData;
    pagesSparse = (data.pages as (Page | null)[] | undefined)?.slice() ?? [];
    questions = data.questions ?? [];
    micro = data.micro as Micro | undefined;
    speak_prompts = data.speak_prompts as SpeakPrompt[] | undefined;
  } else {
    stages = emptyStages();
    const shell = await saveDraft({
      day,
      targetLang,
      pack: {
        lesson: {
          id: `${targetLang}.d${String(day).padStart(2, '0')}`,
          target_lang: targetLang,
          day,
          kind: 'lesson',
          pages: [],
        },
        items: [],
        pages: [],
        questions: [],
      },
      meta: {
        stages,
        timing: [],
        flagged: false,
      },
    });
    version = shell.version;
  }

  if (version == null) throw new Error('No draft version');

  // --- A: Outline ---
  if (stages.outline !== 'done' || !outline) {
    const out = await runOutlineStage({ day, targetLang });
    attempts += 1;
    model = out.model;
    timings.push(out.timing);
    outline = out.outline;

    const outlineErrors = out.issues.length
      ? out.issues
      : validateOutline(outline);
    if (outlineErrors.some((i) => i.severity === 'error')) {
      stages = { ...stages, outline: 'failed', text_ready: false };
      await persist(
        day,
        targetLang,
        version,
        partialFromOutline(outline, day, targetLang),
        {
          stages,
          timing: timings,
          outline,
          flagged: true,
          issues: outlineErrors,
        },
        opts.onProgress,
      );
      throw new Error(
        `Outline validation failed: ${outlineErrors.map((i) => i.message).join('; ')}`,
      );
    }

    const sorted = [...outline.pages].sort((a, b) => a.index - b.index);
    stages = {
      outline: 'done',
      pages: sorted.map((p) => ({
        index: p.index,
        page_id: p.page_id,
        status: 'pending',
      })),
      questions: 'pending',
      continuity: 'pending',
      text_ready: false,
    };
    data = partialFromOutline(outline, day, targetLang);
    pagesSparse = data.pages as (Page | null)[];
    await persist(
      day,
      targetLang,
      version,
      data,
      { stages, timing: timings, outline, flagged: false },
      opts.onProgress,
    );
  } else {
    // ensure pagesSparse sized
    const sorted = [...outline.pages].sort((a, b) => a.index - b.index);
    if (pagesSparse.length < sorted.length) {
      pagesSparse = sorted.map((_, i) => pagesSparse[i] ?? null);
    }
    if (stages.pages.length === 0) {
      stages = {
        ...stages,
        pages: sorted.map((p) => ({
          index: p.index,
          page_id: p.page_id,
          status: pagesSparse[p.index] ? 'done' : 'pending',
        })),
      };
    }
  }

  // --- B + C in parallel ---
  const needPages = stages.pages.some((p) => p.status !== 'done');
  const needQuestions = stages.questions !== 'done';

  const pageWork = needPages
    ? (async () => {
        const pending = stages.pages.filter((p) => p.status !== 'done');
        const entries = pending.map((p) => {
          const entry = outline!.pages.find((x) => x.index === p.index);
          if (!entry) throw new Error(`Missing outline entry ${p.index}`);
          return entry;
        });

        const pageErrors: string[] = [];
        console.info(
          `[v2-gen:stage] day=${day} pages starting pending=${entries.map((e) => e.page_id).join(',') || '(none)'}`,
        );
        await mapPool(entries, PAGE_CONCURRENCY, async (entry) => {
          try {
            const result = await runPageStage({
              outline: outline!,
              entry,
              targetLang,
              day,
            });
            attempts += result.attempts;
            model = result.model;
            timings.push(...result.timings);
            pagesSparse[entry.index] = result.page;
            stages = {
              ...stages,
              pages: stages.pages.map((ps) =>
                ps.index === entry.index
                  ? {
                      ...ps,
                      status: 'done',
                      attempts: result.attempts,
                      last_error: undefined,
                    }
                  : ps,
              ),
            };
            data = {
              ...data,
              outline,
              items: outline!.items,
              pages: pagesSparse.slice(),
              questions,
            };
            const done = stages.pages.filter((p) => p.status === 'done').length;
            const failed = stages.pages
              .filter((p) => p.status === 'failed')
              .map((p) => p.page_id);
            console.info(
              `[v2-gen:stage] day=${day} pages progress done=${done}/${stages.pages.length} failed=[${failed.join(',')}]`,
            );
            await persist(
              day,
              targetLang,
              version!,
              data,
              { stages, timing: timings, outline, flagged: false },
              opts.onProgress,
            );
            return result.page;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            pageErrors.push(`${entry.page_id}: ${message}`);
            stages = {
              ...stages,
              pages: stages.pages.map((ps) =>
                ps.index === entry.index
                  ? { ...ps, status: 'failed', last_error: message }
                  : ps,
              ),
            };
            const done = stages.pages.filter((p) => p.status === 'done').length;
            const failed = stages.pages
              .filter((p) => p.status === 'failed')
              .map((p) => p.page_id);
            console.info(
              `[v2-gen:stage] day=${day} pages progress done=${done}/${stages.pages.length} failed=[${failed.join(',')}]`,
            );
            await persist(
              day,
              targetLang,
              version!,
              { ...data, pages: pagesSparse, outline },
              {
                stages,
                timing: timings,
                outline,
                flagged: true,
                issues: [
                  {
                    path: `pages[${entry.index}]`,
                    rule: 'page_failed',
                    message,
                    severity: 'error',
                  },
                ],
              },
              opts.onProgress,
            );
            return null;
          }
        });
        if (pageErrors.length) {
          console.info(
            `[v2-gen:stage] day=${day} pages FAILED ${pageErrors.map((e) => e.split(':')[0]).join(',')}`,
          );
          throw new Error(`Page stage failed: ${pageErrors.join(' | ')}`);
        }
        console.info(`[v2-gen:stage] day=${day} pages all done`);
      })()
    : Promise.resolve();

  const questionsWork = needQuestions
    ? (async () => {
        const result = await runQuestionsStage({ outline: outline!, day });
        attempts += 1;
        model = result.model;
        timings.push(result.timing);
        questions = result.questions;
        micro = result.micro;
        speak_prompts = result.speak_prompts;
        const qFailed = result.issues.some((i) => i.severity === 'error');
        stages = {
          ...stages,
          questions: qFailed ? 'failed' : 'done',
        };
        data = {
          ...data,
          outline,
          items: outline!.items,
          pages: pagesSparse.slice(),
          questions,
          micro,
          speak_prompts,
        };
        await persist(
          day,
          targetLang,
          version!,
          data,
          {
            stages,
            timing: timings,
            outline,
            flagged: qFailed,
            issues: result.issues,
          },
          opts.onProgress,
        );
        if (qFailed) {
          throw new Error(
            `Questions validation failed: ${result.issues.map((i) => i.message).join('; ')}`,
          );
        }
      })()
    : Promise.resolve();

  const settled = await Promise.allSettled([pageWork, questionsWork]);
  const stageErrors = settled
    .filter((s): s is PromiseRejectedResult => s.status === 'rejected')
    .map((s) => (s.reason instanceof Error ? s.reason.message : String(s.reason)));
  if (stageErrors.length) {
    throw new Error(stageErrors.join(' | '));
  }

  // Ensure questions / micro / speak loaded if skipped
  if (!questions.length && data.questions?.length) {
    questions = data.questions;
  }
  if (!micro && data.micro) {
    micro = data.micro as Micro;
  }
  if (!speak_prompts?.length && data.speak_prompts) {
    speak_prompts = data.speak_prompts as SpeakPrompt[];
  }

  // --- Assemble ---
  let pack = assembleLessonPack({
    day,
    targetLang,
    outline: outline!,
    pagesByIndex: pagesMapFromSparse(pagesSparse),
    questions,
    micro,
    speak_prompts,
  });

  // --- Continuity (max one regen round) ---
  if (stages.continuity !== 'done') {
    const cont = await runContinuityPass({ pack });
    attempts += 1;
    model = cont.model;
    timings.push(cont.timing);

    if (cont.result.regenerate.length > 0) {
      const regenEntries = cont.result.regenerate
        .map((idx) => outline!.pages.find((p) => p.index === idx))
        .filter((e): e is NonNullable<typeof e> => !!e);

      console.info(
        `[v2-gen:stage] day=${day} continuity regen=[${regenEntries.map((e) => e.page_id).join(',')}]`,
      );
      await mapPool(regenEntries, PAGE_CONCURRENCY, async (entry) => {
        const result = await runPageStage({
          outline: outline!,
          entry,
          targetLang,
          day,
        });
        attempts += result.attempts;
        model = result.model;
        timings.push(...result.timings);
        pagesSparse[entry.index] = result.page;
        return result.page;
      });

      pack = assembleLessonPack({
        day,
        targetLang,
        outline: outline!,
        pagesByIndex: pagesMapFromSparse(pagesSparse),
        questions,
        micro,
        speak_prompts,
      });
    }

    stages = { ...stages, continuity: 'done' };
    data = {
      ...pack,
      outline,
    };
    await persist(
      day,
      targetLang,
      version,
      data,
      { stages, timing: timings, outline, flagged: false },
      opts.onProgress,
    );
  }

  // --- Final strict validate ---
  const validation = validateLessonPack(pack, { mode: 'strict' });
  const issues = validation.issues.filter((i) => i.severity === 'error');
  const warnings = [
    ...validation.issues.filter((i) => i.severity === 'warning'),
    ...runGenerationChecks(pack),
  ];
  const flagged = hasErrors({ issues: [...issues, ...warnings] }) && issues.length > 0;

  stages = { ...stages, text_ready: !flagged || issues.length === 0 ? true : !hasErrors(validation) };
  // text_ready when assembled and continuity done; flagged separately
  stages = { ...stages, text_ready: true };

  const usage = sumUsage(timings);
  const cost = buildDayCost({
    model,
    durationMs: Date.now() - wallStart,
    usage,
    images: { generated: 0, skipped: 0, flagged: 0 },
    calls: timings,
  });
  printTimingTable(day, timings, Date.now() - wallStart);

  const saved = await persist(
    day,
    targetLang,
    version,
    pack,
    {
      stages,
      timing: timings,
      outline,
      flagged,
      issues: [...issues, ...warnings],
      cost,
    },
    opts.onProgress,
  );

  return {
    saved,
    pack,
    issues,
    warnings,
    flagged,
    cost,
    attempts,
    timings,
    stages,
  };
}
