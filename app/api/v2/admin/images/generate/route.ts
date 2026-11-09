import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  enqueueLessonImages,
  loadLessonAndStoryForImages,
  storySceneKey,
} from '@/lib/v2/images';
import { drainLessonImageJobs } from '@/lib/v2/generation/drainImages';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Body = {
  key?: string;
  day?: number;
  kind?: 'story_scene' | 'item' | 'spec';
  item_id?: string;
  /** Reclaim ready images and overwrite the stored asset. */
  force?: boolean;
};

/**
 * Enqueue one content image job (async). Poll GET /api/v2/admin/images?day=.
 */
export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    const day = body.day;
    if (!day || !Number.isInteger(day) || day < 1) {
      return NextResponse.json({ error: 'day required' }, { status: 400 });
    }

    const { lesson, story } = await loadLessonAndStoryForImages(day);
    if (!lesson && !story) {
      return NextResponse.json(
        { error: `no lesson/story for day ${day}` },
        { status: 404 },
      );
    }

    let key = body.key?.trim() || '';
    if (!key) {
      if (body.kind === 'story_scene' || (!body.kind && !body.item_id)) {
        if (!story) {
          return NextResponse.json(
            { error: `no story for day ${day}` },
            { status: 404 },
          );
        }
        key = storySceneKey(day, story.target_lang);
      } else if (body.item_id) {
        const item = lesson?.pack.items?.find((i) => i.id === body.item_id);
        if (!item) {
          return NextResponse.json(
            { error: 'item not found', item_id: body.item_id },
            { status: 404 },
          );
        }
        key =
          (item as { image?: { key?: string } }).image?.key || item.id;
      } else {
        return NextResponse.json(
          { error: 'key, item_id, or story_scene kind required' },
          { status: 400 },
        );
      }
    }

    const enqueued = await enqueueLessonImages({
      day,
      keys: [key],
      force: body.force !== false,
    });

    if (enqueued.jobIds.length > 0) {
      void drainLessonImageJobs({
        day: enqueued.day,
        targetLang: enqueued.target_lang,
      })
        .then((n) => {
          console.info(
            '[v2-admin images generate] drain done',
            key,
            `processed=${n}`,
          );
        })
        .catch((err) => {
          console.error(
            '[v2-admin images generate] drain failed',
            key,
            err instanceof Error ? err.message : err,
          );
        });
    }

    return NextResponse.json({
      queued: true,
      started: enqueued.jobIds.length > 0,
      key,
      day: enqueued.day,
      version: enqueued.version,
      estimate_usd: enqueued.estimateUsd,
      jobId: enqueued.jobIds[0] ?? null,
      jobIds: enqueued.jobIds,
      message: 'Image job enqueued. Poll GET /api/v2/admin/images?day= for status.',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
