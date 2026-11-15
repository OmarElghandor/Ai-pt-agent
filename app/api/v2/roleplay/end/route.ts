import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { MongoRoleplaySessionStore } from '@/lib/v2/roleplay/store';

export const runtime = 'nodejs';

/**
 * End a role-play session early (marks done without awarding a star).
 * Body: { session_id }
 */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
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

  const store = new MongoRoleplaySessionStore();
  const state = await store.get(sessionId, userId);
  if (!state) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  state.status = 'done';
  state.current_step_id = null;
  state.updated_at = new Date().toISOString();
  await store.save(state);

  return NextResponse.json({
    session_id: state.id,
    status: state.status,
  });
}
