import mongoose from 'mongoose';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { V2JobModel } from '@/lib/v2/mongo/models';
import { inputHash } from '@/lib/v2/generation/lesson/hash';
import { packIdFor, savePackDraft } from './save';

export type EnqueuePackResult = {
  day: number;
  version: number;
  target_lang: string;
  pack_id: string;
  lesson_version: number;
  jobIds: string[];
};

/**
 * Pack DAG after a published lesson:
 * pack_outline → pack_beats → pack_critic → pack_lang_check → pack_assemble
 */
export async function enqueuePackDag(opts: {
  day: number;
  targetLang?: string;
}): Promise<EnqueuePackResult> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const published = await getPublishedLesson(opts.day);
  if (!published || published.target_lang !== target_lang) {
    throw new Error(`No published lesson for day ${opts.day}`);
  }

  const pack_id = packIdFor(opts.day, target_lang);
  const draft = await savePackDraft({
    day: opts.day,
    targetLang: target_lang,
    data: {
      day: opts.day,
      target_lang,
      character: { id: 'rita', name_tl: 'Rita' },
      skill_mix: {
        speaking: 0.3,
        listening: 0.3,
        reading: 0.2,
        writing: 0.2,
      },
      beats: [],
    },
    meta: {
      lesson_version: published.version,
      stale: false,
      text_ready: false,
      flagged: false,
      job_graph: true,
    },
  });

  const version = draft.version;
  const base = {
    lesson_id: pack_id,
    day: opts.day,
    target_lang,
    version,
    status: 'queued' as const,
    depends_on: [] as mongoose.Types.ObjectId[],
  };

  const outlineId = new mongoose.Types.ObjectId();
  const beatsId = new mongoose.Types.ObjectId();
  const criticId = new mongoose.Types.ObjectId();
  const langId = new mongoose.Types.ObjectId();
  const assembleId = new mongoose.Types.ObjectId();

  const rows = [
    {
      _id: outlineId,
      ...base,
      kind: 'pack_outline',
      input_hash: inputHash({
        kind: 'pack_outline',
        day: opts.day,
        lesson_version: published.version,
      }),
      depends_on: [],
    },
    {
      _id: beatsId,
      ...base,
      kind: 'pack_beats',
      input_hash: inputHash({
        kind: 'pack_beats',
        day: opts.day,
        lesson_version: published.version,
      }),
      depends_on: [outlineId],
    },
    {
      _id: criticId,
      ...base,
      kind: 'pack_critic',
      input_hash: inputHash({
        kind: 'pack_critic',
        day: opts.day,
        v: version,
      }),
      depends_on: [beatsId],
    },
    {
      _id: langId,
      ...base,
      kind: 'pack_lang_check',
      input_hash: inputHash({
        kind: 'pack_lang_check',
        day: opts.day,
        v: version,
      }),
      depends_on: [criticId],
    },
    {
      _id: assembleId,
      ...base,
      kind: 'pack_assemble',
      input_hash: inputHash({
        kind: 'pack_assemble',
        day: opts.day,
        lesson_version: published.version,
      }),
      depends_on: [langId],
    },
  ];

  await V2JobModel().insertMany(rows);

  return {
    day: opts.day,
    version,
    target_lang,
    pack_id,
    lesson_version: published.version,
    jobIds: rows.map((r) => String(r._id)),
  };
}
