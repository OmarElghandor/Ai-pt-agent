import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import { jobCallContext } from '@/lib/v2/generation/lesson/jobs/call';
import { freeTopicById } from '@/lib/v2/convo/topics';
import { runTopicAnglesJob } from './runTopicAngles';
import { saveTopicAngles } from './saveAngles';

/**
 * Process a topic_angles job (T7.1). Separate from lesson convo packs.
 */
export async function processTopicAnglesJob(
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
        const topicId =
          (job.input as { topic_id?: string } | undefined)?.topic_id ??
          job.lesson_id.replace(/^free\./, '');
        const topic = freeTopicById(topicId);
        if (!topic) throw new Error(`Unknown free topic: ${topicId}`);

        const result = await runTopicAnglesJob({
          topic,
          targetLang: job.target_lang,
        });
        if (!result.ok) {
          throw new Error(
            `topic_angles failed: ${result.issues.join('; ') || 'not enough valid angles'}`,
          );
        }

        const saved = await saveTopicAngles({
          targetLang: job.target_lang,
          topicId: topic.id,
          angles: result.angles,
        });

        await finishJobSuccess({
          jobId: job.id,
          output: {
            topic_id: topic.id,
            angle_count: saved.angles.length,
            version: saved.version,
            dropped: result.dropped,
            issues: result.issues,
          },
          tokens: result.tokens,
          over_budget: result.over_budget,
          provider: result.provider,
          model: result.model,
          timing: result.timing,
        });
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobFailed(job.id, message);
    throw err;
  }
}
