import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
  learnerGenderFromUser,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { loadRoleplaySituation } from '@/lib/v2/roleplay/load';
import { startRoleplaySession } from '@/lib/v2/roleplay/start';
import { MongoRoleplaySessionStore } from '@/lib/v2/roleplay/store';

export const runtime = 'nodejs';

/**
 * Start or resume a role-play session.
 * Body: { situation_id, session_id? }
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
    situation_id?: string;
    session_id?: string;
  } | null;

  const situationId = body?.situation_id?.trim();
  if (!situationId) {
    return NextResponse.json({ error: 'situation_id required' }, { status: 400 });
  }

  try {
    loadRoleplaySituation(situationId);
  } catch {
    return NextResponse.json({ error: 'situation not found' }, { status: 404 });
  }

  const store = new MongoRoleplaySessionStore();
  const gender = learnerGenderFromUser(user);
  const learnerName = user?.name?.trim().split(/\s+/)[0] ?? null;

  const result = await startRoleplaySession({
    userId,
    situationId,
    gender,
    learnerName,
    sessionId: body?.session_id?.trim(),
    store,
  });

  return NextResponse.json({
    session_id: result.state.id,
    situation_id: result.state.situation_id,
    resumed: result.resumed,
    events: result.events,
    session: {
      id: result.state.id,
      current_step_id: result.state.current_step_id,
      status: result.state.status,
      slots: result.state.slots,
    },
  });
}
