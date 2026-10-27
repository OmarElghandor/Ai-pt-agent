import type { LessonPack } from '@/lib/v2/content/lesson';
import {
  hasErrors,
  validateLessonPack,
  type Issue,
} from '@/lib/v2/content/validate';
import { buildDayCost, logDayCost, type DayCost, type CallTiming } from './cost';
import { runGenerationChecks } from './generationChecks';
import { canGenerate, getDayPlan } from './plan';
import { saveDraft, type SavedLesson } from './save';
import {
  runStagedGeneration,
  type OrchestratorResult,
} from './stages/orchestrator';

export type GenerateResult = {
  saved: SavedLesson;
  pack: LessonPack;
  issues: Issue[];
  warnings: Issue[];
  flagged: boolean;
  cost: DayCost;
  attempts: number;
  timings?: CallTiming[];
  stages?: OrchestratorResult['stages'];
};

export type RunGenerateOptions = {
  day: number;
  skipImages?: boolean;
  skipAudio?: boolean;
  /** Resume this draft version. */
  version?: number;
  /** Injected for tests — skips Claude and staged pipeline. */
  packOverride?: LessonPack;
  onProgress?: OrchestratorResult extends never
    ? never
    : Parameters<typeof runStagedGeneration>[0]['onProgress'];
};

/**
 * Staged lesson generation (outline → pages ∥ questions → continuity → validate).
 * Images and audio are not part of this pipeline.
 */
export async function generateLessonDraft(
  opts: RunGenerateOptions,
): Promise<GenerateResult> {
  const dayPlan = getDayPlan(opts.day);
  const ready = canGenerate(dayPlan);
  if (!ready.ok) {
    throw new Error(`Cannot generate day ${opts.day}: ${ready.reason}`);
  }

  if (opts.packOverride) {
    const pack: LessonPack = {
      ...opts.packOverride,
      lesson: {
        ...opts.packOverride.lesson,
        day: opts.day,
        target_lang: opts.packOverride.lesson.target_lang || 'pt-PT',
        id:
          opts.packOverride.lesson.id ||
          `pt-PT.d${String(opts.day).padStart(2, '0')}`,
      },
    };
    const validation = validateLessonPack(pack, { mode: 'strict' });
    const issues = validation.issues.filter((i) => i.severity === 'error');
    const warnings = [
      ...validation.issues.filter((i) => i.severity === 'warning'),
      ...runGenerationChecks(pack),
    ];
    const flagged = hasErrors({ issues: [...issues, ...warnings] }) && issues.length > 0;
    const cost = buildDayCost({
      model: 'override',
      durationMs: 0,
      usage: {},
      images: { generated: 0, skipped: 0, flagged: 0 },
      calls: [],
    });
    logDayCost(opts.day, cost);
    const saved = await saveDraft({
      day: opts.day,
      pack,
      meta: { flagged, issues: [...issues, ...warnings], cost },
    });
    return {
      saved,
      pack,
      issues,
      warnings,
      flagged,
      cost,
      attempts: 1,
      timings: [],
    };
  }

  const result = await runStagedGeneration({
    day: opts.day,
    version: opts.version,
    onProgress: opts.onProgress,
  });

  logDayCost(opts.day, result.cost);

  return {
    saved: result.saved,
    pack: result.pack,
    issues: result.issues,
    warnings: result.warnings,
    flagged: result.flagged,
    cost: result.cost,
    attempts: result.attempts,
    timings: result.timings,
    stages: result.stages,
  };
}
