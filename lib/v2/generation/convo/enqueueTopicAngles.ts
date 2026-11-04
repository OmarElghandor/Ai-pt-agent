import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { inputHash } from '@/lib/v2/generation/lesson/hash';
import {
  freeTopicById,
  loadFreeTopicsFile,
  type FreeTopic,
} from '@/lib/v2/convo/topics';

export type EnqueueTopicAnglesResult = {
  target_lang: string;
  topic_id: string;
  jobId: string;
};

/**
 * One-off topic_angles job per free topic (T7.1).
 * Uses lesson_id free.<topic> and day 0 to fit the existing job schema.
 */
export async function enqueueTopicAnglesJob(opts: {
  topicId: string;
  targetLang?: string;
}): Promise<EnqueueTopicAnglesResult> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const target_lang = opts.targetLang ?? 'pt-PT';
  const topic = freeTopicById(opts.topicId);
  if (!topic) throw new Error(`Unknown free topic: ${opts.topicId}`);

  const lesson_id = `free.${topic.id}`;
  const jobId = new mongoose.Types.ObjectId();

  await V2JobModel().create({
    _id: jobId,
    lesson_id,
    day: 0,
    target_lang,
    version: 1,
    status: 'queued',
    kind: 'topic_angles',
    input_hash: inputHash({
      kind: 'topic_angles',
      topic_id: topic.id,
      target_lang,
    }),
    input: { topic_id: topic.id },
    depends_on: [],
  });

  return {
    target_lang,
    topic_id: topic.id,
    jobId: String(jobId),
  };
}

export async function enqueueAllTopicAnglesJobs(opts?: {
  targetLang?: string;
}): Promise<EnqueueTopicAnglesResult[]> {
  const file = loadFreeTopicsFile();
  const targetLang = opts?.targetLang ?? file.target_lang;
  const out: EnqueueTopicAnglesResult[] = [];
  for (const topic of file.topics) {
    out.push(
      await enqueueTopicAnglesJob({ topicId: topic.id, targetLang }),
    );
  }
  return out;
}

export function freeTopicsForJobs(): FreeTopic[] {
  return loadFreeTopicsFile().topics;
}
