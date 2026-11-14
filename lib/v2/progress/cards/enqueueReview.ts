/**
 * Durable enqueue for flashcard ratings. The HTTP route returns after insert;
 * `after()` (or a later drain) applies SRS via reviewCard.
 */
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2CardReviewJobModel,
  V2SessionModel,
} from '@/lib/v2/mongo/models';
import { localDateString } from '@/lib/v2/progress/localDate';
import type { CardRating } from '@/lib/v2/progress/types';
import { reviewCard } from '@/lib/v2/progress/cardsStore';

export type EnqueueCardReviewResult =
  | { ok: true; job_id: string; queued: true }
  | { ok: true; already_done: true }
  | { ok: false; error: string };

export async function enqueueCardReview(opts: {
  user_id: string;
  item_id: string;
  rating: CardRating;
  timeZone?: string;
  now?: Date;
}): Promise<EnqueueCardReviewResult> {
  if (!mongoConfigured()) {
    return { ok: false, error: 'MongoDB not configured' };
  }
  await connectMongo();

  const now = opts.now ?? new Date();
  const tz = opts.timeZone ?? 'UTC';
  const local_date = localDateString(now, tz);

  const sessionDoc = await V2SessionModel()
    .findOne({ user_id: opts.user_id, kind: 'cards', local_date })
    .lean();
  if (!sessionDoc) return { ok: false, error: 'no_session' };

  const entry = (sessionDoc.queue ?? []).find(
    (q) => q.item_id === opts.item_id,
  );
  if (!entry) return { ok: false, error: 'not_in_queue' };
  if (entry.rating) return { ok: true, already_done: true };
  if (sessionDoc.status === 'done') {
    return { ok: false, error: 'session_done' };
  }

  const existing = await V2CardReviewJobModel()
    .findOne({
      user_id: opts.user_id,
      local_date,
      item_id: opts.item_id,
    })
    .lean();

  if (existing?.status === 'done') {
    return { ok: true, already_done: true };
  }

  if (existing?.status === 'running' || existing?.status === 'queued') {
    // Idempotent accept: keep the first rating; still return job id for drain.
    return {
      ok: true,
      job_id: String(existing._id),
      queued: true,
    };
  }

  if (existing?.status === 'failed') {
    await V2CardReviewJobModel().updateOne(
      { _id: existing._id },
      {
        $set: {
          rating: opts.rating,
          tz,
          status: 'queued',
          error: null,
          processed_at: null,
        },
      },
    );
    return { ok: true, job_id: String(existing._id), queued: true };
  }

  try {
    const created = await V2CardReviewJobModel().create({
      user_id: opts.user_id,
      local_date,
      item_id: opts.item_id,
      rating: opts.rating,
      tz,
      status: 'queued',
    });
    return { ok: true, job_id: String(created._id), queued: true };
  } catch (err) {
    // Concurrent tap: unique index on user×date×item.
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code?: number }).code
        : undefined;
    if (code !== 11000) throw err;
    const raced = await V2CardReviewJobModel()
      .findOne({
        user_id: opts.user_id,
        local_date,
        item_id: opts.item_id,
      })
      .lean();
    if (!raced) throw err;
    if (raced.status === 'done') return { ok: true, already_done: true };
    return { ok: true, job_id: String(raced._id), queued: true };
  }
}

export async function processPendingCardReview(jobId: string): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();

  const claimed = await V2CardReviewJobModel().findOneAndUpdate(
    { _id: jobId, status: 'queued' },
    { $set: { status: 'running' } },
    { new: true },
  );
  if (!claimed) {
    // Already running/done/failed, or missing.
    return;
  }

  try {
    const result = await reviewCard({
      user_id: claimed.user_id,
      item_id: claimed.item_id,
      rating: claimed.rating as CardRating,
      timeZone: claimed.tz ?? 'UTC',
    });

    if ('error' in result) {
      // Session already rated / gone: treat not_in_queue after prior apply as done.
      if (
        result.error === 'not_in_queue' ||
        result.error === 'session_done' ||
        result.error === 'already_rated'
      ) {
        await V2CardReviewJobModel().updateOne(
          { _id: jobId },
          {
            $set: {
              status: 'done',
              processed_at: new Date(),
              error: null,
            },
          },
        );
        return;
      }
      await V2CardReviewJobModel().updateOne(
        { _id: jobId },
        {
          $set: {
            status: 'failed',
            error: result.error,
            processed_at: new Date(),
          },
        },
      );
      return;
    }

    await V2CardReviewJobModel().updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'done',
          processed_at: new Date(),
          error: null,
        },
      },
    );
  } catch (err) {
    await V2CardReviewJobModel().updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'failed',
          error: err instanceof Error ? err.message : 'process_failed',
          processed_at: new Date(),
        },
      },
    );
  }
}
