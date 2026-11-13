import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { findExistingDecksForTopic } from '@/lib/v2/decks/find';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => null)) as {
    topic?: string;
  } | null;
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 });
  }

  const decks = await findExistingDecksForTopic(topic);
  return NextResponse.json({ decks });
}
