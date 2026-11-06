import { getCurrentUserId } from '@/lib/auth/currentUser';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  loadConvoItemSurfaces,
  requireConvoPackAsync,
} from '@/lib/v2/convo/pack';
import {
  MongoConvoSessionStore,
  getConvoSession,
} from '@/lib/v2/convo/session';
import { createAnswersConvoProgressWriter } from '@/lib/v2/convo/progress';
import {
  createLiveConvoStreamModel,
  encodeConvoTurnEvent,
  runConvoTurn,
  runFreeConvoTurn,
  type ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';

export const runtime = 'nodejs';

/**
 * One streamed conversation turn (09 §4.2 / Module C).
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
    assisted?: boolean;
    survival?: 'repeat' | 'slow' | 'nao_percebi';
    character_id?: string;
    dismiss_cta?: boolean;
    via_voice?: boolean;
    learner_turn_id?: string;
  } | null;
  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'session_id required' }, { status: 400 });
  }
  const survival =
    body?.survival === 'repeat' ||
    body?.survival === 'slow' ||
    body?.survival === 'nao_percebi'
      ? body.survival
      : undefined;

  const store = new MongoConvoSessionStore();
  const session = await getConvoSession(store, { sessionId, userId });
  if (!session) {
    return Response.json({ error: 'session not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: ConvoTurnStreamEvent) => {
        controller.enqueue(encoder.encode(encodeConvoTurnEvent(event)));
      };
      try {
        if (session.module === 'free') {
          const { metrics } = await runFreeConvoTurn({
            session,
            learnerText: body?.text ?? '',
            store,
            model: createLiveConvoStreamModel(),
            emit,
            ...(body?.assisted ? { assisted: true } : {}),
            ...(body?.character_id
              ? { characterId: body.character_id }
              : {}),
            ...(body?.dismiss_cta ? { dismissCta: true } : {}),
            ...(body?.learner_turn_id
              ? { learnerTurnId: body.learner_turn_id }
              : {}),
          });
          void metrics;
        } else {
          const surfaces = loadConvoItemSurfaces();
          const pack = await requireConvoPackAsync(session.pack_id, {
            itemSurfaces: surfaces,
          });
          const { metrics } = await runConvoTurn({
            session,
            pack,
            surfaces,
            learnerText: body?.text ?? '',
            store,
            model: createLiveConvoStreamModel(),
            emit,
            progressWriter: createAnswersConvoProgressWriter(),
            ...(survival ? { survival } : {}),
            ...(body?.via_voice ? { viaVoice: true } : {}),
            ...(body?.learner_turn_id
              ? { learnerTurnId: body.learner_turn_id }
              : {}),
          });
          void metrics;
        }
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
