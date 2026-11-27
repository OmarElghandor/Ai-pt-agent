import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { V2MicroClipModel, V2MicroProgressModel, V2MicroSeriesModel } from '@/lib/v2/mongo/microModels';
import { handleAnswerRequest } from '@/lib/v2/answers/handle';
import { createMongoProgressStore, handleProgressEvent } from '@/lib/v2/progress/events';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  await connectMongo();
  const progress = await V2MicroProgressModel()
    .findOne({ user_id: userId, clip_id: id })
    .lean();
  return NextResponse.json({
    revealed_count: progress?.revealed_count ?? 0,
    finished_at: progress?.finished_at ?? null,
    replays: progress?.replays ?? 0,
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    action: 'start' | 'reveal' | 'finish' | 'save_line' | 'review';
    revealed_count?: number;
    item_id?: string;
  };
  await connectMongo();
  const clip = await V2MicroClipModel().findById(id).lean();
  if (!clip || clip.status !== 'published') {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const Progress = V2MicroProgressModel();

  if (body.action === 'start') {
    await Progress.updateOne(
      { user_id: userId, clip_id: id },
      {
        $setOnInsert: {
          user_id: userId,
          clip_id: id,
          revealed_count: 0,
          replays: 0,
        },
        $set: { started_at: new Date() },
      },
      { upsert: true },
    );
    await handleProgressEvent(
      {
        event_id: randomUUID(),
        kind: 'micro_clip_started',
        clip_id: id,
        target_lang: clip.target_lang,
      },
      { userId, store: createMongoProgressStore() },
    );
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'reveal') {
    const count = Math.max(0, Math.floor(body.revealed_count ?? 0));
    await Progress.updateOne(
      { user_id: userId, clip_id: id },
      {
        $set: { revealed_count: count },
        $setOnInsert: {
          user_id: userId,
          clip_id: id,
          started_at: new Date(),
          replays: 0,
        },
      },
      { upsert: true },
    );
    return NextResponse.json({ ok: true, revealed_count: count });
  }

  if (body.action === 'finish') {
    const series = await V2MicroSeriesModel().findById(clip.series_id).lean();
    const itemIds = (clip.lines ?? []).map((l) => l.item_id);
    const answer = await handleAnswerRequest(
      {
        kind: 'micro_clip_finish',
        answer_id: randomUUID(),
        day: 1,
        clip_id: id,
        item_ids: itemIds,
        deck_id: series?.official_deck_id,
      },
      { userId },
    );
    await Progress.updateOne(
      { user_id: userId, clip_id: id },
      {
        $set: {
          finished_at: new Date(),
          revealed_count: itemIds.length,
        },
        $inc: { replays: 1 },
        $setOnInsert: {
          user_id: userId,
          clip_id: id,
          started_at: new Date(),
        },
      },
      { upsert: true },
    );
    await handleProgressEvent(
      {
        event_id: randomUUID(),
        kind: 'micro_clip_finished',
        clip_id: id,
        line_count: itemIds.length,
        target_lang: clip.target_lang,
      },
      { userId, store: createMongoProgressStore() },
    );
    return NextResponse.json({ ok: true, answer });
  }

  if (body.action === 'save_line') {
    if (!body.item_id) {
      return NextResponse.json({ error: 'item_id required' }, { status: 400 });
    }
    const series = await V2MicroSeriesModel().findById(clip.series_id).lean();
    const answer = await handleAnswerRequest(
      {
        kind: 'micro_clip_save_line',
        answer_id: randomUUID(),
        day: 1,
        clip_id: id,
        item_id: body.item_id,
        deck_id: series?.official_deck_id,
      },
      { userId },
    );
    return NextResponse.json({ ok: true, answer });
  }

  if (body.action === 'review') {
    const lineCount = (clip.lines ?? []).length;
    await Progress.updateOne(
      { user_id: userId, clip_id: id },
      {
        $set: { last_reviewed_at: new Date() },
        $inc: { review_count: 1 },
        $setOnInsert: {
          user_id: userId,
          clip_id: id,
          started_at: new Date(),
          revealed_count: lineCount,
          replays: 0,
        },
      },
      { upsert: true },
    );
    await handleProgressEvent(
      {
        event_id: randomUUID(),
        kind: 'micro_clip_reviewed',
        clip_id: id,
        line_count: lineCount,
        target_lang: clip.target_lang,
      },
      { userId, store: createMongoProgressStore() },
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'bad action' }, { status: 400 });
}
