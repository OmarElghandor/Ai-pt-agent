/**
 * Enqueue topic_angles jobs for all 6 free topics (T7.1).
 * Drain with the normal v2 worker.
 */
import { enqueueAllTopicAnglesJobs } from '@/lib/v2/generation/convo/enqueueTopicAngles';

async function main() {
  const jobs = await enqueueAllTopicAnglesJobs();
  for (const j of jobs) {
    console.log(`queued topic_angles ${j.topic_id} job=${j.jobId}`);
  }
  console.log(`enqueued ${jobs.length} topic_angles jobs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
