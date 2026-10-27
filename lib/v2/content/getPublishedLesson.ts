import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { LessonPackSchema, type LessonPack } from '@/lib/v2/content/lesson';
import { V2LessonModel } from '@/lib/v2/mongo/models';

export type PublishedLesson = {
  day: number;
  target_lang: string;
  version: number;
  status: string;
  pack: LessonPack;
};

/** Published lesson for a day, newest version. Null when Mongo is down or the day is missing. */
export async function getPublishedLesson(day: number): Promise<PublishedLesson | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2LessonModel()
    .findOne({ day, status: 'published' })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return {
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status,
    pack: LessonPackSchema.parse(doc.data),
  };
}
