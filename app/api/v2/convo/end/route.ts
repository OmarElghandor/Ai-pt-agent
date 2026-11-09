import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  MongoConvoSessionStore,
  getConvoSession,
} from '@/lib/v2/convo/session';
import { buildConvoSessionSummary } from '@/lib/v2/convo/result';
import { freeTopicIdForPack } from '@/lib/v2/convo/topics';

export const runtime = 'nodejs';

/** POST { session_id } — mark done and return خلّص summary (Batch 10 D7). */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    session_id?: string;
  } | null;
  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  const store = new MongoConvoSessionStore();
  const session = await getConvoSession(store, { sessionId, userId });
  if (!session) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  session.status = 'done';
  session.updated_at = new Date().toISOString();
  const saved = await store.save(session);
  const summary = buildConvoSessionSummary(saved);

  const practiceTopicId =
    saved.module === 'lesson'
      ? freeTopicIdForPack(saved.pack_id) ?? 'open'
      : saved.topic_id;

  return NextResponse.json({
    ok: true,
    summary,
    practice_topic_id: practiceTopicId,
    practice_href: practiceTopicId
      ? `/talk/free/${encodeURIComponent(practiceTopicId)}`
      : '/talk/practice',
  });
}
