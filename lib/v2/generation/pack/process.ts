import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { validatePracticePack } from '@/lib/v2/content/validatePack';
import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import { getDayPlan } from '@/lib/v2/generation/lesson/plan';
import { buildPackFromLesson } from './buildFromLesson';
import {
  getLatestPack,
  setPackHandoff,
  updatePackDraft,
  type PackMeta,
} from './save';
import { skillMixCounts } from '@/lib/v2/content/validatePack';

/**
 * Process one pack_* job. Reuses lesson job persist helpers.
 */
export async function processPackJob(
  job: JobView,
  _workerId: string,
): Promise<void> {
  await markJobStarted(job.id);
  try {
    const published = await getPublishedLesson(job.day);
    if (!published) throw new Error(`No published lesson for day ${job.day}`);

    const packDoc = await getLatestPack(job.day, job.target_lang);
    if (!packDoc || packDoc.version !== job.version) {
      throw new Error(`Pack draft v${job.version} missing`);
    }

    const plan = getDayPlan(job.day);
    const chatCharacter = plan.generation?.chat_character ?? 'rita';

    switch (job.kind) {
      case 'pack_outline': {
        const counts = skillMixCounts(10);
        const outline = {
          day: job.day,
          lesson_version: published.version,
          skill_counts: counts,
          character: chatCharacter ?? 'rita',
          item_ids: (published.pack.items ?? []).map((i) => i.id),
        };
        await setPackHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'outline',
          value: outline,
        });
        await finishJobSuccess({
          jobId: job.id,
          output: outline,
          handoff: outline,
        });
        return;
      }
      case 'pack_beats': {
        const data = buildPackFromLesson({
          day: job.day,
          lesson: published.pack,
          chatCharacter: chatCharacter ?? 'rita',
          targetLang: job.target_lang,
          beatCount: 10,
        });
        await updatePackDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          data,
          mergeMeta: true,
          meta: {
            lesson_version: published.version,
            stale: false,
          },
        });
        await setPackHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'beats',
          value: { beat_count: data.beats.length },
        });
        await finishJobSuccess({
          jobId: job.id,
          output: { beat_count: data.beats.length },
          handoff: { beat_count: data.beats.length },
        });
        return;
      }
      case 'pack_critic': {
        const latest = await getLatestPack(job.day, job.target_lang);
        const items = published.pack.items ?? [];
        const result = validatePracticePack(latest?.data, { items });
        const high = result.issues.filter((i) => i.severity === 'error');
        await updatePackDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          mergeMeta: true,
          meta: {
            flagged: high.length > 0,
            issues: result.issues,
          },
        });
        await setPackHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'critic',
          value: { ok: result.ok, issue_count: result.issues.length },
        });
        await finishJobSuccess({
          jobId: job.id,
          output: { ok: result.ok, issues: result.issues },
          handoff: { ok: result.ok },
          issues: result.issues,
        });
        return;
      }
      case 'pack_lang_check': {
        await setPackHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'lang_check',
          value: { patches: [] },
        });
        await finishJobSuccess({
          jobId: job.id,
          output: { patches: [] },
          handoff: { patches: [] },
        });
        return;
      }
      case 'pack_assemble': {
        const latest = await getLatestPack(job.day, job.target_lang);
        if (!latest) throw new Error('pack missing at assemble');
        const items = published.pack.items ?? [];
        let data = latest.data;
        const first = validatePracticePack(data, { items });
        if (!first.ok || (data.beats?.length ?? 0) < 8) {
          data = buildPackFromLesson({
            day: job.day,
            lesson: published.pack,
            chatCharacter: chatCharacter ?? 'rita',
            targetLang: job.target_lang,
          });
        }
        const final = validatePracticePack(data, { items });
        const meta: PackMeta = {
          lesson_version: published.version,
          stale: false,
          text_ready: final.ok,
          flagged: !final.ok,
          issues: final.issues,
        };
        await updatePackDraft({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          data,
          mergeMeta: true,
          meta,
        });
        await setPackHandoff({
          day: job.day,
          targetLang: job.target_lang,
          version: job.version,
          key: 'assemble',
          value: { ok: final.ok, beats: data.beats.length },
        });
        await finishJobSuccess({
          jobId: job.id,
          output: { ok: final.ok, beats: data.beats.length },
          handoff: { ok: final.ok },
          issues: final.issues,
        });
        return;
      }
      default:
        throw new Error(`Unknown pack kind ${job.kind}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
    throw err;
  }
}
