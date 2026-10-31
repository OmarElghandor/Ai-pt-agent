import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  parseStoryDoc,
  storyIdFor,
  type StoryDoc,
} from '@/lib/v2/content/story';
import { V2StoryModel } from '@/lib/v2/mongo/models';

function leanToStory(doc: {
  id: string;
  day: number;
  target_lang: string;
  version: number;
  status: string;
  cast: unknown;
  setting: string;
  lines: unknown;
  image_spec?: unknown;
  scenes?: unknown;
  is_weekly?: unknown;
  after_questions?: unknown;
  reading?: unknown;
}): StoryDoc {
  return parseStoryDoc({
    id: doc.id,
    day: doc.day,
    target_lang: doc.target_lang,
    version: doc.version,
    status: doc.status,
    cast: doc.cast,
    setting: doc.setting,
    lines: doc.lines,
    image_spec: doc.image_spec,
    scenes: doc.scenes,
    is_weekly: doc.is_weekly,
    after_questions: doc.after_questions,
    reading: doc.reading,
  });
}

export async function saveStoryDoc(story: StoryDoc): Promise<StoryDoc> {
  if (!mongoConfigured()) {
    throw new Error('MongoDB not configured');
  }
  await connectMongo();
  const parsed = parseStoryDoc(story);
  const Model = V2StoryModel();
  const $set: Record<string, unknown> = {
    id: parsed.id,
    day: parsed.day,
    target_lang: parsed.target_lang,
    version: parsed.version,
    status: parsed.status,
    cast: parsed.cast,
    setting: parsed.setting,
    lines: parsed.lines,
  };
  const $unset: Record<string, 1> = {};
  if (parsed.image_spec != null) $set.image_spec = parsed.image_spec;
  else $unset.image_spec = 1;
  if (parsed.scenes != null) $set.scenes = parsed.scenes;
  else $unset.scenes = 1;
  if (parsed.is_weekly != null) $set.is_weekly = parsed.is_weekly;
  else $unset.is_weekly = 1;
  if (parsed.after_questions != null) $set.after_questions = parsed.after_questions;
  else $unset.after_questions = 1;
  if (parsed.reading != null) $set.reading = parsed.reading;
  else $unset.reading = 1;

  await Model.findOneAndUpdate(
    { id: parsed.id, version: parsed.version },
    {
      $set,
      ...(Object.keys($unset).length ? { $unset } : {}),
    },
    { upsert: true, new: true },
  );
  return parsed;
}

export async function getStoryVersion(opts: {
  day: number;
  version: number;
  targetLang?: string;
}): Promise<StoryDoc | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const id = storyIdFor(opts.day, target_lang);
  const doc = await V2StoryModel()
    .findOne({ id, version: opts.version })
    .lean();
  if (!doc) {
    const byDay = await V2StoryModel()
      .findOne({
        day: opts.day,
        target_lang,
        version: opts.version,
      })
      .lean();
    if (!byDay) return null;
    return leanToStory(byDay as Parameters<typeof leanToStory>[0]);
  }
  return leanToStory(doc as Parameters<typeof leanToStory>[0]);
}

export async function getPublishedStory(opts: {
  day: number;
  targetLang?: string;
}): Promise<StoryDoc | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const doc = await V2StoryModel()
    .findOne({
      day: opts.day,
      target_lang,
      status: { $in: ['published', 'ready'] },
    })
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return leanToStory(doc as Parameters<typeof leanToStory>[0]);
}

export async function getStoryById(
  id: string,
  version?: number,
): Promise<StoryDoc | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const q: Record<string, unknown> = { id };
  if (version != null) q.version = version;
  const doc = await V2StoryModel()
    .findOne(q)
    .sort({ version: -1 })
    .lean();
  if (!doc) return null;
  return leanToStory(doc as Parameters<typeof leanToStory>[0]);
}

/** Publish the story version that matches the lesson version. */
export async function publishStoryVersion(opts: {
  day: number;
  version: number;
  targetLang?: string;
}): Promise<StoryDoc> {
  const story = await getStoryVersion(opts);
  if (!story) {
    throw new Error(`No story for day ${opts.day} v${opts.version}`);
  }
  if (story.status === 'failed') {
    throw new Error('Story status is failed');
  }
  const published = await saveStoryDoc({ ...story, status: 'published' });
  // Demote other published versions
  await V2StoryModel().updateMany(
    {
      day: opts.day,
      target_lang: opts.targetLang ?? 'pt-PT',
      status: 'published',
      version: { $ne: opts.version },
    },
    { $set: { status: 'ready' } },
  );
  return published;
}

/** Clear audio on a line when tl changes; write audio keys. */
export async function patchStoryLineAudio(opts: {
  id: string;
  version: number;
  lineIndex: number;
  audio: { normal?: string; slow?: string };
}): Promise<StoryDoc | null> {
  const story = await getStoryById(opts.id, opts.version);
  if (!story) return null;
  const lines = [...story.lines];
  const line = lines[opts.lineIndex];
  if (!line) return null;
  lines[opts.lineIndex] = {
    ...line,
    audio: { ...line.audio, ...opts.audio },
  };
  return saveStoryDoc({ ...story, lines });
}
