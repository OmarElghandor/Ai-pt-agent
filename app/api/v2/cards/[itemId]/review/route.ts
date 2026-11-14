import { NextResponse, after } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import type { CardRating } from '@/lib/v2/progress';
import {
  enqueueCardReview,
  processPendingCardReview,
} from '@/lib/v2/progress/cards/enqueueReview';

export const runtime = 'nodejs';

const RATINGS = new Set(['again', 'hard', 'easy', 'know']);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ itemId: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { itemId } = await ctx.params;
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    rating?: string;
  } | null;
  if (!body?.rating || !RATINGS.has(body.rating)) {
    return NextResponse.json(
      { error: 'rating must be again|hard|easy|know' },
      { status: 400 },
    );
  }

  const tz = req.headers.get('x-timezone') ?? 'UTC';
  const result = await enqueueCardReview({
    user_id: userId,
    item_id: itemId,
    rating: body.rating as CardRating,
    timeZone: tz,
  });

  if (!result.ok) {
    const status =
      result.error === 'no_session'
        ? 404
        : result.error === 'session_done' || result.error === 'not_in_queue'
          ? 409
          : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  if ('queued' in result && result.queued) {
    const jobId = result.job_id;
    after(() => {
      void processPendingCardReview(jobId);
    });
    return NextResponse.json(
      { ok: true, queued: true, job_id: jobId },
      { status: 202 },
    );
  }

  return NextResponse.json({ ok: true, already_done: true }, { status: 200 });
}
