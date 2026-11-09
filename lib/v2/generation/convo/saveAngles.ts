import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2TopicAnglesModel } from '@/lib/v2/mongo/models';
import type { TopicAngle, TopicAnglesDoc } from '@/lib/v2/convo/topics';

export async function saveTopicAngles(opts: {
  targetLang: string;
  topicId: string;
  angles: TopicAngle[];
  version?: number;
}): Promise<TopicAnglesDoc> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const latest = await V2TopicAnglesModel()
    .findOne({
      target_lang: opts.targetLang,
      topic_id: opts.topicId,
    })
    .sort({ version: -1 })
    .lean();

  const version = opts.version ?? (latest?.version ?? 0) + 1;

  await V2TopicAnglesModel().findOneAndUpdate(
    {
      target_lang: opts.targetLang,
      topic_id: opts.topicId,
      version,
    },
    {
      $set: {
        target_lang: opts.targetLang,
        topic_id: opts.topicId,
        version,
        angles: opts.angles,
      },
    },
    { upsert: true, new: true },
  );

  return {
    target_lang: opts.targetLang,
    topic_id: opts.topicId,
    angles: opts.angles,
    version,
  };
}

/** Seed Mongo from a validated content-file doc (no model). */
export async function upsertTopicAnglesFromDoc(
  doc: TopicAnglesDoc,
): Promise<TopicAnglesDoc> {
  return saveTopicAngles({
    targetLang: doc.target_lang,
    topicId: doc.topic_id,
    angles: doc.angles,
    version: doc.version,
  });
}
