import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { runGenerateCustomDeck } from '@/lib/v2/decks/generate/run';
import { isV2Enabled } from '@/lib/v2/flags';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const user = await getCurrentV2User();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    topic?: string;
    phase?: 'A1' | 'A2';
  } | null;
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }

  const tz = req.headers.get('x-timezone') ?? user.timezone ?? 'Europe/Lisbon';
  const local_date = userLocalDate(tz);

  const result = await runGenerateCustomDeck({
    user_id: user.id,
    topic,
    local_date,
    phase: body?.phase === 'A2' ? 'A2' : 'A1',
  });

  if (!result.ok) {
    const status = result.reason === 'quota' ? 429 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
