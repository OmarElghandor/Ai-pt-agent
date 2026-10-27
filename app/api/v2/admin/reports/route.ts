import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { V2ReportModel } from '@/lib/v2/mongo/models';
import { connectMongo, mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

export async function GET() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const docs = await V2ReportModel()
    .find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  return NextResponse.json({
    reports: docs.map((d) => ({
      id: String(d._id),
      item_id: d.item_id ?? null,
      question_id: d.question_id ?? null,
      day: d.day,
      note: d.note,
      user_id: d.user_id ?? null,
      created_at: (d as { createdAt?: Date }).createdAt ?? null,
    })),
  });
}
