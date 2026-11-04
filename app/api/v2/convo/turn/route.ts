import { getCurrentUserId } from '@/lib/auth/currentUser';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  loadConvoItemSurfaces,
  requireConvoPack,
} from '@/lib/v2/convo/pack';
import {
  MongoConvoSessionStore,
  getConvoSession,
} from '@/lib/v2/convo/session';
import {
  createLiveConvoStreamModel,
  encodeConvoTurnEvent,
  runConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

export const runtime = 'nodejs';

/**
 * One streamed conversation turn (09 §4.2).
 * Body: { session_id: string, text: string }
 * Response: text/x-ndjson event stream.
 */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return Response.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const userId = getCurrentUserId();
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    session_id?: string;
    text?: string;
  } | null;
  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'session_id required' }, { status: 400 });
  }

  const store = new MongoConvoSessionStore();
  const session = await getConvoSession(store, { sessionId, userId });
  if (!session) {
    return Response.json({ error: 'session not found' }, { status: 404 });
  }

  let pack;
  try {
    const surfaces = loadConvoItemSurfaces();
    pack = requireConvoPack(session.pack_id, { itemSurfaces: surfaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'pack load failed';
    return Response.json({ error: message }, { status: 400 });
  }

  const surfaces = loadConvoItemSurfaces();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ConvoTurnStreamEvent) => {
        controller.enqueue(encoder.encode(encodeConvoTurnEvent(event)));
      };
      try {
        const { metrics } = await runConvoTurn({
          session,
          pack,
          surfaces,
          learnerText: body?.text ?? '',
          store,
          model: createLiveConvoStreamModel(),
          emit,
        });
        // Metrics event reserved for T2.1; still available on done path via session.
        void metrics;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'turn failed';
        emit({ type: 'done', ok: false, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
