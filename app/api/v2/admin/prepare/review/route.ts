import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  listReviewQueue,
  markAutoPublishedChecked,
} from '@/lib/v2/generation/prepare/reviewQueue';
import { enqueueOrJoinPrepareDay } from '@/lib/v2/generation/prepare';
import { V2LessonModel } from '@/lib/v2/mongo/models';
import { connectMongo } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ items: [] });
  }
  const url = new URL(req.url);
  const lang = url.searchParams.get('lang')?.trim() || 'pt-PT';
  const items = await listReviewQueue(lang);
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    action?: 'mark_checked' | 'regenerate' | 'unpublish';
    day?: number;
    version?: number;
  } | null;

  const day = Number(body?.day);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }
  const action = body?.action;
  if (!action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  if (action === 'mark_checked') {
    await markAutoPublishedChecked({
      day,
      version: body?.version,
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === 'regenerate') {
    const enqueued = await enqueueOrJoinPrepareDay({
      day,
      force: true,
      startWorker: true,
    });
    return NextResponse.json({
      ok: true,
      action,
      job_id: enqueued.jobId,
    });
  }

  if (action === 'unpublish') {
    await connectMongo();
    const doc = await V2LessonModel()
      .findOne({ day, status: 'published' })
      .sort({ version: -1 });
    if (!doc) {
      return NextResponse.json({ error: 'no published lesson' }, { status: 404 });
    }
    doc.status = 'draft';
    await doc.save();
    return NextResponse.json({ ok: true, action, version: doc.version });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
