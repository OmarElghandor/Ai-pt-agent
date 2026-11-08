import type { Item } from '@/lib/v2/content/items';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { hasErrors, validateLessonPack } from '@/lib/v2/content/validate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonModel } from '@/lib/v2/mongo/models';
import { isBlockedForPublish } from './issueResolve';
import { publishItemsToRegistry } from './registry';
import {
  getLatestLesson,
  getLessonVersion,
  type GenerationMeta,
  type SavedLesson,
} from './save';
import { getStoryVersion, publishStoryVersion } from './storySave';

export class PublishLessonError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'blocked'
      | 'validation'
      | 'registry'
      | 'mongo'
      | 'story',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PublishLessonError';
  }
}

/**
 * Sole path to `status: published`. Runs block gate, strict validate,
 * registry write, then demotes other published versions.
 *
 * `force: true` (dev / talk testing only): skip block gate, strict
 * validation, and hard story readiness — still flips status + registry.
 */
export async function publishLesson(opts: {
  day: number;
  targetLang?: string;
  version?: number;
  /** Bypass blockers / strict validation (local testing). */
  force?: boolean;
}): Promise<{
  lesson: SavedLesson;
  registry: { written: number; conflicts: string[] };
}> {
  if (!mongoConfigured()) {
    throw new PublishLessonError('MongoDB not configured', 'mongo');
  }
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const force = Boolean(opts.force);

  const lesson =
    opts.version != null
      ? await getLessonVersion(opts.day, opts.version, target_lang)
      : await getLatestLesson(opts.day, target_lang);
  if (!lesson) {
    throw new PublishLessonError('No lesson for day', 'not_found');
  }

  if (
    !force &&
    isBlockedForPublish(lesson.meta as GenerationMeta | undefined)
  ) {
    throw new PublishLessonError(
      'Cannot publish while flagged / blocked',
      'blocked',
      { meta: lesson.meta },
    );
  }

  if (!force) {
    const validation = validateLessonPack(lesson.data as LessonPack, {
      mode: 'strict',
    });
    if (hasErrors(validation)) {
      throw new PublishLessonError('Strict validation failed', 'validation', {
        issues: validation.issues.filter((i) => i.severity === 'error'),
      });
    }
  }

  const pack = lesson.data as LessonPack;
  const storyId = pack.lesson.story_id;
  let storyReady = false;
  if (storyId) {
    const story = await getStoryVersion({
      day: opts.day,
      version: lesson.version,
      targetLang: lesson.target_lang,
    });
    const ok =
      Boolean(story) &&
      story!.id === storyId &&
      story!.status !== 'failed' &&
      Boolean(story!.lines?.length);
    if (!ok && !force) {
      if (!story || story.id !== storyId) {
        throw new PublishLessonError(
          'Story document missing or id mismatch',
          'story',
          { storyId, story: story?.id },
        );
      }
      throw new PublishLessonError('Story is not ready to publish', 'story', {
        status: story.status,
      });
    }
    storyReady = ok;
  }

  const registry = await publishItemsToRegistry({
    day: opts.day,
    targetLang: lesson.target_lang,
    items: (pack.items as Item[]) ?? [],
  });
  if (registry.conflicts.length && !force) {
    throw new PublishLessonError('Registry tl conflicts', 'registry', {
      conflicts: registry.conflicts,
    });
  }

  const Model = V2LessonModel();
  const doc = await Model.findOne({
    day: opts.day,
    target_lang: lesson.target_lang,
    version: lesson.version,
  });
  if (!doc) {
    throw new PublishLessonError('No lesson for day', 'not_found');
  }

  await Model.updateMany(
    {
      day: opts.day,
      target_lang: lesson.target_lang,
      status: 'published',
      _id: { $ne: doc._id },
    },
    { $set: { status: 'reviewed' } },
  );

  if (storyId && storyReady) {
    await publishStoryVersion({
      day: opts.day,
      version: lesson.version,
      targetLang: lesson.target_lang,
    });
  }

  doc.status = 'published';
  if (force) {
    const prev = ((doc as { meta?: GenerationMeta }).meta ??
      {}) as GenerationMeta;
    (doc as { meta?: GenerationMeta }).meta = {
      ...prev,
      flagged: false,
      prepare_error_eg: undefined,
    };
    doc.markModified?.('meta');
  }
  await doc.save();

  const { markPacksStaleForLesson } = await import(
    '@/lib/v2/generation/pack/save'
  );
  await markPacksStaleForLesson({
    day: opts.day,
    targetLang: lesson.target_lang,
    lessonVersion: lesson.version,
  });

  return {
    lesson: {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: 'published',
      data: doc.data as LessonPack,
      meta: (doc as { meta?: GenerationMeta }).meta,
    },
    registry,
  };
}
