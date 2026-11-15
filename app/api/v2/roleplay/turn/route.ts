import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { createAnswersConvoProgressWriter } from '@/lib/v2/convo/progress';
import { awaitAndEmitCorrection } from '@/lib/v2/convo/correction';
import { noFreeTextCorrection } from '@/lib/v2/grader';
import { loadRoleplaySituation } from '@/lib/v2/roleplay/load';
import { runRoleplayTurn } from '@/lib/v2/roleplay/engine';
import {
  encodeRoleplayTurnEvent,
  MongoRoleplaySessionStore,
  MongoRoleplayStarsStore,
} from '@/lib/v2/roleplay/store';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';

export const runtime = 'nodejs';

/**
 * One streamed role-play turn.
 * Body: { session_id, text, help?, assisted?, learner_turn_id? }
 * Response: text/x-ndjson
 */
export async function POST(req: Request) {
  if (!isV2Enabled()) {
    return Response.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
  if (!userId) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    session_id?: string;
    text?: string;
    help?: boolean;
    assisted?: boolean;
    learner_turn_id?: string;
  } | null;

  const sessionId = body?.session_id?.trim();
  if (!sessionId) {
    return Response.json({ error: 'session_id required' }, { status: 400 });
  }

  const store = new MongoRoleplaySessionStore();
  const state = await store.get(sessionId, userId);
  if (!state) {
    return Response.json({ error: 'session not found' }, { status: 404 });
  }

  const situation = loadRoleplaySituation(state.situation_id);
  const starsStore = new MongoRoleplayStarsStore();
  const progressWriter = createAnswersConvoProgressWriter();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: RoleplayTurnEvent) => {
        controller.enqueue(encoder.encode(encodeRoleplayTurnEvent(event)));
      };
      try {
        const result = await runRoleplayTurn(
          {
            situation,
            state,
            learnerText: body?.text ?? '',
            help: Boolean(body?.help),
            assisted: Boolean(body?.assisted),
            learner_turn_id: body?.learner_turn_id,
          },
          { progressWriter },
        );

        for (const event of result.events) {
          if (event.type === 'done') continue;
          emit(event);
        }

        if (result.correctionPromise && body?.learner_turn_id) {
          await awaitAndEmitCorrection({
            promise: result.correctionPromise.then(
              (c) => c ?? noFreeTextCorrection(),
            ),
            learner_turn_id: body.learner_turn_id,
            original: body.text ?? '',
            emit: (e) => {
              if (e.type !== 'correction') return;
              emit({
                type: 'correction',
                learner_turn_id: e.learner_turn_id,
                tl: e.corrected_tl,
                ar: e.ar ?? undefined,
                original: e.original,
              });
            },
          });
        }

        if (result.state.status === 'done') {
          await starsStore.awardStar(
            userId,
            result.state.situation_id,
            result.state.tier,
          );
        }

        await store.save(result.state);
        emit({
          type: 'done',
          finished: result.state.status === 'done',
        });
      } catch (err) {
        emit({
          type: 'coach',
          eg: 'حصل خطأ — جرّب تاني.',
          moment: 'error',
        });
        emit({ type: 'done', finished: false });
        console.error('[roleplay/turn]', err);
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
