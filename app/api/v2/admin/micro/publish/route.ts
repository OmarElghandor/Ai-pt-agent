import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { publishMicroClip, publishMicroSeries } from '@/lib/v2/micro/publish';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const body = (await req.json()) as {
    clip_id?: string;
    series_id?: string;
  };
  if (body.clip_id) {
    const result = await publishMicroClip(body.clip_id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.series_id) {
    const result = await publishMicroSeries(body.series_id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json(
    { error: 'clip_id or series_id required' },
    { status: 400 },
  );
}
