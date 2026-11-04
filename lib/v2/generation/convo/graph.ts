import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { inputHash } from '@/lib/v2/generation/lesson/hash';
import { convoPackIdFor, saveConvoPackDraft } from './save';

export type EnqueueConvoResult = {
  day: number;
  version: number;
  target_lang: string;
  pack_id: string;
  lesson_version: number;
  jobIds: string[];
};

/**
 * Convo pack DAG after a published lesson (T5.1: outline only;
 * T5.2 expands convo_items; T5.3 fills critic/lang_check/assemble).
 */
export async function enqueueConvoDag(opts: {
  day: number;
  targetLang?: string;
}): Promise<EnqueueConvoResult> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const published = await getPublishedLesson(opts.day);
  if (!published || published.target_lang !== target_lang) {
    throw new Error(`No published lesson for day ${opts.day}`);
  }

  const pack_id = convoPackIdFor(opts.day, target_lang);
  const draft = await saveConvoPackDraft({
    day: opts.day,
    targetLang: target_lang,
    data: {
      pack_id,
      day: opts.day,
      target_lang,
    },
    meta: {
      lesson_version: published.version,
      stale: false,
      text_ready: false,
      audio_ready: false,
      flagged: false,
      job_graph: true,
    },
  });

  const version = draft.version;
  const outlineId = new mongoose.Types.ObjectId();

  await V2JobModel().insertMany([
    {
      _id: outlineId,
      lesson_id: pack_id,
      day: opts.day,
      target_lang,
      version,
      status: 'queued',
      kind: 'convo_outline',
      input_hash: inputHash({
        kind: 'convo_outline',
        day: opts.day,
        lesson_version: published.version,
      }),
      depends_on: [],
    },
  ]);

  return {
    day: opts.day,
    version,
    target_lang,
    pack_id,
    lesson_version: published.version,
    jobIds: [String(outlineId)],
  };
}
