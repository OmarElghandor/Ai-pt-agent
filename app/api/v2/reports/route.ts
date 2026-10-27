import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { isV2Enabled } from '@/lib/v2/flags';
import { V2ReportModel } from '@/lib/v2/mongo/models';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    item_id?: string;
    question_id?: string;
    day?: number;
    note?: string;
  } | null;
  if (!body || typeof body.day !== 'number' || !body.note?.trim()) {
    return NextResponse.json(
      { error: 'day and note required' },
      { status: 400 },
    );
  }
  if (!body.item_id && !body.question_id) {
    return NextResponse.json(
      { error: 'item_id or question_id required' },
      { status: 400 },
    );
  }
  await connectMongo();
  const userId = getCurrentUserId();
  const doc = await V2ReportModel().create({
    item_id: body.item_id || undefined,
    question_id: body.question_id || undefined,
    day: body.day,
    note: body.note.trim().slice(0, 2000),
    user_id: userId || undefined,
  });
  return NextResponse.json({ id: String(doc._id), ok: true });
}
