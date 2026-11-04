import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import {
  MongoConvoSessionStore,
  startConvoSession,
} from '@/lib/v2/convo/session';

export const runtime = 'nodejs';

/**
 * Start or resume a lesson conversation (09 §10). No model call.
 * Body: { pack_id: string, session_id?: string }
 */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const userId = getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    pack_id?: string;
    session_id?: string;
  } | null;
  const packId = body?.pack_id?.trim();
  if (!packId) {
    return NextResponse.json({ error: 'pack_id required' }, { status: 400 });
  }

  try {
    const surfaces = loadConvoItemSurfaces();
    const pack = requireConvoPack(packId, { itemSurfaces: surfaces });
    const store = new MongoConvoSessionStore();
    const result = await startConvoSession({
      userId,
      pack,
      store,
      ...(body?.session_id ? { sessionId: body.session_id } : {}),
    });
    return NextResponse.json({
      session_id: result.session.id,
      pack_id: pack.pack_id,
      day: pack.day,
      resumed: result.resumed,
      opening: result.opening,
      session: {
        id: result.session.id,
        rungs: result.session.rungs,
        phase: result.session.phase,
        status: result.session.status,
        current_group: result.session.current_group,
        pending_question: result.session.pending_question,
      },
      visual: pack.visual,
      character_id: pack.scene.character_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
