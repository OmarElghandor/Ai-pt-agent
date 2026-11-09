import type { JobView } from '@/lib/v2/generation/lesson/graph';
import {
  finishJobFailed,
  finishJobSuccess,
  markJobStarted,
} from '@/lib/v2/generation/lesson/jobs/persist';
import { jobCallContext } from '@/lib/v2/generation/lesson/jobs/call';
import { freeTopicById } from '@/lib/v2/convo/topics';
import {
  AUTHORED_THREAD_TOPIC_IDS,
  runTopicThreadsJob,
} from './runTopicThreads';
import { saveThreadTopicFile } from './saveThreads';

/**
 * Process a topic_angles job — now generates thread banks (Batch 9 C10).
 * Refuses the 12 authored topics.
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
        if (AUTHORED_THREAD_TOPIC_IDS.has(topicId)) {
          throw new Error(
            `Authored topic ${topicId} must not be regenerated`,
          );
        }
        const topic = freeTopicById(topicId);
        if (!topic) {
          // Allow generating a brand-new id not yet in the catalogue:
          // synthesise a minimal FreeTopic from job input.
          const input = job.input as {
            title_tl?: string;
            title_ar?: string;
            character_id?: string;
            related?: string[];
          };
          if (!input.title_tl || !input.character_id) {
            throw new Error(`Unknown free topic: ${topicId}`);
          }
          const synthetic = {
            id: topicId,
            title_tl: input.title_tl,
            title_ar: input.title_ar ?? input.title_tl,
            title_in_sentence_tl: input.title_tl,
            character_id: input.character_id,
            intro_eg: '',
            opening_tl: `Olá {name}! Vamos falar de ${input.title_tl}?`,
            opening_ar: '',
            related_topic_ids: input.related ?? ['casa'],
            word_set: [],
          };
          const result = await runTopicThreadsJob({
            topic: synthetic,
            targetLang: job.target_lang,
          });
          if (!result.ok || !result.doc) {
            throw new Error(
              `topic_threads failed: ${result.issues.join('; ')}`,
            );
          }
          const filePath = saveThreadTopicFile(result.doc);
          await finishJobSuccess({
            jobId: job.id,
            output: {
              topic_id: topicId,
              thread_count: result.doc.threads.length,
              file: filePath,
              issues: result.issues,
            },
            tokens: result.tokens,
            over_budget: result.over_budget,
            provider: result.provider,
            model: result.model,
            timing: result.timing,
          });
          return;
        }

        const result = await runTopicThreadsJob({
          topic,
          targetLang: job.target_lang,
        });
        if (!result.ok || !result.doc) {
          throw new Error(
            `topic_threads failed: ${result.issues.join('; ')}`,
          );
        }
        const filePath = saveThreadTopicFile(result.doc);
        await finishJobSuccess({
          jobId: job.id,
          output: {
            topic_id: topic.id,
            thread_count: result.doc.threads.length,
            file: filePath,
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
