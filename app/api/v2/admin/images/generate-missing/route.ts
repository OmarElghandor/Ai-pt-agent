import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { enqueueLessonImages } from '@/lib/v2/images';
import { drainLessonImageJobs } from '@/lib/v2/generation/drainImages';
import { cloudinaryConfigured } from '@/lib/v2/images/storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Enqueue missing lesson images as queue jobs and drain in the background.
 */
export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    day?: number;
    force?: boolean;
  } | null;
  const day = body?.day;
  if (!day || !Number.isInteger(day) || day < 1 || day > 90) {
    return NextResponse.json({ error: 'day required' }, { status: 400 });
  }

  try {
    const enqueued = await enqueueLessonImages({
      day,
      force: Boolean(body?.force),
    });

    const storage = cloudinaryConfigured() ? 'cloudinary' : 'local';
    if (enqueued.jobIds.length > 0) {
      void drainLessonImageJobs({
        day: enqueued.day,
        targetLang: enqueued.target_lang,
      })
        .then((n) => {
          console.info(
            '[v2-admin images generate-missing] drain done',
            `day=${day}`,
            `processed=${n}`,
          );
        })
        .catch(async (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            '[v2-admin images generate-missing] drain failed',
            day,
            msg,
          );
          try {
            const { V2ImageModel } = await import('@/lib/v2/mongo/models');
            if (enqueued.keys.length) {
              await V2ImageModel().updateMany(
                {
                  key: { $in: enqueued.keys },
                  status: { $in: ['queued', 'generating'] },
                },
                {
                  $set: {
                    status: 'failed',
                    reason: `drain failed: ${msg.slice(0, 400)}`,
                  },
                  $unset: { generating_started_at: 1 },
                },
              );
            }
          } catch {
            // best-effort status for operators polling GET /images
          }
        });
    }

    return NextResponse.json({
      queued: true,
      started: enqueued.jobIds.length > 0,
      day: enqueued.day,
      version: enqueued.version,
      target_lang: enqueued.target_lang,
      missing: enqueued.missingCount,
      estimate_usd: enqueued.estimateUsd,
      jobIds: enqueued.jobIds,
      keys: enqueued.keys,
      storage,
      message:
        enqueued.jobIds.length === 0
          ? 'No missing images to generate.'
          : 'Image jobs enqueued. Poll GET /api/v2/admin/images?day= for status.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[v2-admin images generate-missing]', day, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
