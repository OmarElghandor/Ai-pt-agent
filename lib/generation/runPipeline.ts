import { createHash } from 'node:crypto';
import { connectMongo } from '@/lib/mongo';
import { PracticeLessonModel } from '@/lib/mongo/models';
import { adaptMongoPack } from '@/lib/lessons/adaptMongoPack';
import { loadSeedPlan } from '@/lib/lessons/seedPlan';
import {
  assembleInputs,
  buildRequirements,
  seedToPlanSlot,
  type PlanSlotLike,
} from './inputAssembler';
import {
  buildSpecSystemPrompt,
  buildSpecUserPrompt,
  buildPackSystemPrompt,
  buildPackUserPrompt,
  buildReviewerSystemPrompt,
  buildReviewerUserPrompt,
  promptVersionsSnapshot,
} from './prompts';
import { callClaudeJson } from './claudeClient';
import { repairStoryAids } from './repairPack';
import { validatePack } from './validator';

function packIsAlignedLive(doc: {
  lesson_key: string;
  cefr_level?: string;
  topic?: string;
  version?: number;
  status?: string;
  cell_ids?: string[];
  requirements?: { cells?: string[]; words?: string[] } | null;
  spec?: unknown;
  pack?: unknown;
}): boolean {
  if (!doc.pack || !['live', 'reviewed'].includes(String(doc.status))) return false;
  return Boolean(
    adaptMongoPack({
      lesson_key: doc.lesson_key,
      cefr_level: doc.cefr_level,
      topic: doc.topic,
      version: doc.version,
      status: doc.status,
      cell_ids: doc.cell_ids,
      requirements: doc.requirements
        ? {
            cells: doc.requirements.cells ?? [],
            words: doc.requirements.words ?? [],
          }
        : undefined,
      spec: (doc.spec as Record<string, unknown> | null) ?? null,
      pack: (doc.pack as Record<string, unknown> | null) ?? null,
    }),
  );
}

function getPlanSlots(): PlanSlotLike[] {
  return loadSeedPlan().map(seedToPlanSlot);
}

function findSlot(lessonKey: string): PlanSlotLike | null {
  return getPlanSlots().find((s) => s.lesson_key === lessonKey) ?? null;
}

function cellFingerprint(cellIds: string[]): string {
  return createHash('sha1').update([...cellIds].sort().join('|')).digest('hex').slice(0, 16);
}

async function setStage(doc: { generation_stage?: string | null; save: () => Promise<unknown> }, stage: string) {
  doc.generation_stage = stage;
  await doc.save();
}

async function ensureLessonDoc(slot: PlanSlotLike) {
  const Model = PracticeLessonModel();
  let doc = await Model.findOne({ lesson_key: slot.lesson_key, is_current: true });
  if (doc) return doc;
  doc = await Model.create({
    lesson_key: slot.lesson_key,
    version: 1,
    is_current: true,
    topic: slot.topic,
    depth_tier: slot.depth_tier,
    cefr_level: slot.cefr_level,
    curriculum_point: slot.curriculum_point,
    cell_fingerprint: cellFingerprint(slot.cell_ids),
    cell_ids: slot.cell_ids,
    status: 'spec',
    generation_stage: 'queued',
    requirements: { cells: slot.cell_ids, words: [] },
    generation_log: {
      prompt_versions: promptVersionsSnapshot(),
      durations_ms: {},
    },
  });
  return doc;
}

async function existingLessonsForTopic(topic: string, exceptKey: string) {
  const docs = await PracticeLessonModel()
    .find({
      topic,
      status: { $in: ['spec', 'live', 'reviewed', 'generating', 'updating', 'needs_review'] },
      is_current: true,
    })
    .lean();
  return docs
    .filter((d) => d.lesson_key !== exceptKey && d.spec)
    .map((d) => {
      const spec = d.spec as { title_ar?: string; situation_en?: string; situation_ar?: string };
      return {
        title: spec?.title_ar || d.topic,
        situation: spec?.situation_en || spec?.situation_ar,
        cells: d.cell_ids || [],
      };
    });
}

type ReviewerIssue = {
  severity?: string;
  beat_id?: string;
  field?: string;
  problem?: string;
  suggestion?: string;
};

/** Persist only actionable severities; ignore minor / unknown. */
function filterReviewerIssues(issues: ReviewerIssue[]): ReviewerIssue[] {
  return issues.filter((i) => i.severity === 'must_fix' || i.severity === 'should_fix');
}

async function reviewPackOnce(input: {
  cefrLevel: string;
  spec: unknown;
  pack: unknown;
  allowedWords: unknown;
  nucleus: unknown;
}): Promise<{ issues: ReviewerIssue[]; durationMs: number }> {
  const review = await callClaudeJson(
    buildReviewerSystemPrompt(),
    buildReviewerUserPrompt({
      cefrLevel: input.cefrLevel,
      spec: input.spec,
      pack: input.pack,
      allowedWords: input.allowedWords,
      nucleus: input.nucleus,
    }),
    { maxTokens: 8_000 },
  );
  const data = review.data as { issues?: ReviewerIssue[] };
  return {
    issues: Array.isArray(data.issues) ? data.issues : [],
    durationMs: review.durationMs,
  };
}

const inFlight = new Map<string, Promise<{ ok: boolean; error?: string }>>();

/**
 * Generate a lesson pack by calling Anthropic over HTTP (no job queue / worker).
 * Spec → pack → hard validate (+ one full pack regen) → live → reviewer diagnostics.
 * Audio is generated later on play, not here.
 */
export async function generateLessonDirect(
  lessonKey: string,
  opts?: { force?: boolean },
): Promise<{ ok: boolean; error?: string; stage?: string | null }> {
  const existing = inFlight.get(lessonKey);
  if (existing) return existing;

  const promise = (async () => {
    await connectMongo();
    const slot = findSlot(lessonKey);
    if (!slot) {
      return { ok: false, error: `Unknown lesson_key ${lessonKey}` };
    }

    let doc = await ensureLessonDoc(slot);
    const forceRegen = Boolean(opts?.force) || process.env.PRACTICE_LESSON_REGENERATE === 'true';

    try {
      if (!forceRegen && packIsAlignedLive(doc)) {
        await setStage(doc, 'done');
        return { ok: true, stage: 'done' };
      }

      // Stale/misaligned pack or forced regen — clear pack so Prompt 2 rewrites it.
      // On force, also clear spec so Prompt 1 regenerates (avoids reusing a bad origin story).
      if (
        forceRegen ||
        (doc.pack &&
          ['live', 'reviewed', 'failed', 'needs_review'].includes(String(doc.status)))
      ) {
        if (!packIsAlignedLive(doc) || forceRegen) {
          doc.pack = null;
          if (forceRegen) {
            doc.spec = null;
          }
          doc.status = 'spec';
          doc.generation_error = null;
          doc.validator_warnings = [];
          await doc.save();
        }
      }

      if (!(doc.spec as { title_ar?: string } | null)?.title_ar) {
        doc.status = 'generating';
        await setStage(doc, 'preparing_situation');

        const existingLessons = await existingLessonsForTopic(slot.topic, lessonKey);
        const inputs = assembleInputs(slot, existingLessons, { planSlots: getPlanSlots() });
        const specResult = await callClaudeJson(
          buildSpecSystemPrompt(),
          buildSpecUserPrompt(inputs),
          { maxTokens: 12_000 },
        );
        doc = (await PracticeLessonModel().findById(doc._id))!;
        doc.spec = specResult.data;
        doc.requirements = buildRequirements(
          slot,
          specResult.data as { clusters?: Record<string, string[]>; support_words?: string[] },
        );
        doc.status = 'spec';
        const log = (doc.generation_log as Record<string, unknown>) || {};
        doc.generation_log = {
          ...log,
          prompt_versions: promptVersionsSnapshot(),
          claude_model: specResult.model,
          durations_ms: { ...((log.durations_ms as object) || {}), spec: specResult.durationMs },
        };
        await doc.save();
      }

      doc = (await PracticeLessonModel().findById(doc._id))!;
      if (!forceRegen && packIsAlignedLive(doc)) {
        await setStage(doc, 'done');
        return { ok: true, stage: 'done' };
      }

      doc.status = 'generating';
      doc.generation_error = null;
      await setStage(doc, 'writing_exercises');

      const existingLessons = await existingLessonsForTopic(slot.topic, lessonKey);
      const inputs = assembleInputs(slot, existingLessons, { planSlots: getPlanSlots() });
      const packInputs = { ...inputs, spec: doc.spec };

      let packResult = await callClaudeJson(
        buildPackSystemPrompt(),
        buildPackUserPrompt(packInputs),
      );

      let pack = packResult.data;
      doc = (await PracticeLessonModel().findById(doc._id))!;
      await setStage(doc, 'reviewing');

      const validate = validatePack as (
        p: unknown,
        ctx?: { allowedWords?: unknown[]; nucleus?: unknown[]; spec?: unknown },
      ) => { ok: boolean; errors: Array<{ message: string }>; warnings: unknown[] };

      const validateCtx = {
        allowedWords: inputs.allowedWords as unknown[],
        nucleus: inputs.nucleus as unknown[],
        spec: doc.spec,
      };
      repairStoryAids(pack, inputs.allowedWords as unknown[]);
      let validation = validate(pack, validateCtx);

      // Hard fail → regenerate the whole pack once (same prompt, no FIX MODE).
      if (!validation.ok) {
        packResult = await callClaudeJson(
          buildPackSystemPrompt(),
          buildPackUserPrompt(packInputs),
        );
        pack = packResult.data;
        repairStoryAids(pack, inputs.allowedWords as unknown[]);
        validation = validate(pack, validateCtx);
        if (!validation.ok) {
          doc.status = 'failed';
          doc.pack = pack;
          doc.generation_error = validation.errors.map((e) => e.message).join('; ');
          doc.validator_warnings = validation.warnings;
          doc.generation_stage = null;
          await doc.save();
          return { ok: false, error: doc.generation_error };
        }
      }

      doc.pack = pack;
      doc.validator_warnings = validation.warnings;
      doc.requirements = buildRequirements(
        slot,
        doc.spec as { clusters?: Record<string, string[]>; support_words?: string[] },
      );
      doc.status = 'live';
      doc.needs_omar_review = false;
      doc.omar_flag_reason = null;
      doc.generation_error = null;
      doc.generation_stage = 'done';
      await doc.save();

      // Reviewer after live: store issues for humans; never rewrite or block.
      let reviewerMs = 0;
      try {
        const review = await reviewPackOnce({
          cefrLevel: doc.cefr_level,
          spec: doc.spec,
          pack,
          allowedWords: inputs.allowedWords,
          nucleus: inputs.nucleus,
        });
        reviewerMs = review.durationMs;
        doc = (await PracticeLessonModel().findById(doc._id))!;
        doc.reviewer_issues = filterReviewerIssues(review.issues);
      } catch {
        doc = (await PracticeLessonModel().findById(doc._id))!;
        doc.reviewer_issues = [];
      }

      const log = (doc.generation_log as Record<string, unknown>) || {};
      doc.generation_log = {
        ...log,
        prompt_versions: promptVersionsSnapshot(),
        claude_model: packResult.model,
        durations_ms: {
          ...((log.durations_ms as object) || {}),
          pack: packResult.durationMs,
          reviewer: reviewerMs,
        },
        validator_warnings: validation.warnings,
      };
      await doc.save();

      return { ok: true, stage: 'done' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await PracticeLessonModel().findOne({
        lesson_key: lessonKey,
        is_current: true,
      });
      if (failed) {
        failed.status = 'failed';
        failed.generation_error = message;
        failed.generation_stage = null;
        await failed.save();
      }
      return { ok: false, error: message };
    }
  })();

  inFlight.set(lessonKey, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(lessonKey);
  }
}

export { findSlot, getPlanSlots, ensureLessonDoc };
