import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import { jobCallContext } from '@/lib/v2/generation/lesson/jobs/call';
import { runConvoOutlineJob } from './runOutline';
import {
  getLatestConvoPack,
  setConvoHandoff,
  updateConvoPackDraft,
} from './save';

/**
 * Process one convo_* job. Reuses lesson job persist helpers.
 */
export async function processConvoJob(
  job: JobView,
  _workerId: string,
): Promise<void> {
  await markJobStarted(job.id);
  try {
    await jobCallContext.run(
      {
        jobId: job.id,
        day: job.day,
        version: job.version,
      },
      async () => {
        await processConvoJobBody(job);
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
    throw err;
  }
}

async function processConvoJobBody(job: JobView): Promise<void> {
  const published = await getPublishedLesson(job.day);
  if (!published) throw new Error(`No published lesson for day ${job.day}`);

  const packDoc = await getLatestConvoPack(job.day, job.target_lang);
  if (!packDoc || packDoc.version !== job.version) {
    throw new Error(`Convo pack draft v${job.version} missing`);
  }

  switch (job.kind) {
    case 'convo_outline': {
      const result = await runConvoOutlineJob({
        day: job.day,
        targetLang: job.target_lang,
        lesson: published.pack,
      });
      if (!result.ok) {
        throw new Error(
          `convo_outline failed validation: ${result.issues
            .filter((i) => i.severity === 'error')
            .map((i) => i.message)
            .join('; ')}`,
        );
      }
      const outline = result.outline;
      const nextData = {
        ...packDoc.data,
        pack_id: packDoc.data.pack_id ?? job.lesson_id,
        day: job.day,
        target_lang: job.target_lang,
        scene: outline.scene,
        visual: outline.visual,
        groups: outline.groups,
        recap: outline.recap,
        ...(outline.opening_tl
          ? { opening: { tl: outline.opening_tl } }
          : {}),
        ...(outline.closing_tl
          ? { closing: { tl: outline.closing_tl } }
          : {}),
        ...(outline.bridge_tl ? { bridge: { tl: outline.bridge_tl } } : {}),
      };
      await updateConvoPackDraft({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        data: nextData,
        mergeMeta: true,
        meta: {
          lesson_version: published.version,
          stale: false,
          issues: result.issues,
        },
      });
      await setConvoHandoff({
        day: job.day,
        targetLang: job.target_lang,
        version: job.version,
        key: 'outline',
        value: outline,
      });
      await finishJobSuccess({
        jobId: job.id,
        output: outline,
        handoff: {
          groups: outline.groups.map((g) => g.id),
          character_id: outline.scene.character_id,
          visual_type: outline.visual.type,
        },
        tokens: result.tokens,
        over_budget: result.over_budget,
        provider: result.provider,
        model: result.model,
        issues: result.issues,
        timing: result.timing,
      });
      return;
    }
    case 'convo_items':
    case 'convo_critic':
    case 'convo_lang_check':
    case 'convo_assemble':
      throw new Error(
        `convo job kind ${job.kind} not implemented yet (later T5 task)`,
      );
    default:
      throw new Error(`Unknown convo kind ${job.kind}`);
  }
}
