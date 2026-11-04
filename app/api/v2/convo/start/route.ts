import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  loadConvoItemSurfaces,
  requireConvoPackAsync,
} from '@/lib/v2/convo/pack';
import {
  freeTopicById,
  freeTopicIdForPack,
  loadThreadTopic,
} from '@/lib/v2/convo/topics';
import { authoredLinesForWarm, currentNextLine } from '@/lib/v2/convo/free';
import {
  MongoConvoSessionStore,
  startConvoSession,
  startFreeConvoSession,
} from '@/lib/v2/convo/session';

export const runtime = 'nodejs';

/**
 * Start or resume a conversation (09 §10).
 * Lesson: { pack_id, session_id? }
 * Free:   { module: 'free', topic_id, session_id? }
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
    module?: 'lesson' | 'free';
    topic_id?: string;
  } | null;

  const store = new MongoConvoSessionStore();

  if (body?.module === 'free' || body?.topic_id) {
    const topicId = body?.topic_id?.trim();
    if (!topicId) {
      return NextResponse.json({ error: 'topic_id required' }, { status: 400 });
    }
    try {
      const topic = freeTopicById(topicId);
      if (!topic) {
        return NextResponse.json(
          { error: `unknown topic ${topicId}` },
          { status: 400 },
        );
      }
      const result = await startFreeConvoSession({
        userId,
        topicId,
        store,
        topic,
        ...(body?.session_id ? { sessionId: body.session_id } : {}),
      });
      const threadDoc = loadThreadTopic(topic.id);
      const pendingLine = currentNextLine(
        threadDoc,
        result.session.thread_index,
        result.session.free_step,
        topic,
      );
      const pendingTl =
        result.reopening?.pending_tl ?? pendingLine.bubble_tl ?? null;
      return NextResponse.json({
        session_id: result.session.id,
        module: 'free',
        topic_id: topic.id,
        title_tl: topic.title_tl,
        title_ar: topic.title_ar,
        pack_id: result.session.pack_id,
        resumed: result.resumed,
        opening: result.opening,
        ...(result.reopening ? { reopening: result.reopening } : {}),
        pending_tl: pendingTl,
        current_frame: pendingLine.frame
          ? {
              tl: pendingLine.frame.tl,
              eg: pendingLine.frame.eg,
              chips: pendingLine.frame.chips,
            }
          : null,
        warm_lines: authoredLinesForWarm(threadDoc),
        session: {
          id: result.session.id,
          module: result.session.module,
          topic_id: result.session.topic_id,
          rungs: result.session.rungs,
          phase: result.session.phase,
          status: result.session.status,
          help_ladder: result.session.help_ladder,
          current_group: result.session.current_group,
          pending_question: result.session.pending_question,
          struggled: result.session.struggled,
          said_once: result.session.said_once,
          survival_used: result.session.survival_used,
          suggested_words: result.session.suggested_words,
          facts: result.session.facts,
        },
        character_id: topic.character_id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'start failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const packId = body?.pack_id?.trim();
  if (!packId) {
    return NextResponse.json({ error: 'pack_id required' }, { status: 400 });
  }

  try {
    const surfaces = loadConvoItemSurfaces();
    const pack = await requireConvoPackAsync(packId, {
      itemSurfaces: surfaces,
    });
    const result = await startConvoSession({
      userId,
      pack,
      store,
      ...(body?.session_id ? { sessionId: body.session_id } : {}),
    });
    return NextResponse.json({
      session_id: result.session.id,
      module: 'lesson',
      pack_id: pack.pack_id,
      day: pack.day,
      resumed: result.resumed,
      opening: result.opening,
      ...(result.reopening ? { reopening: result.reopening } : {}),
      session: {
        id: result.session.id,
        module: result.session.module,
        rungs: result.session.rungs,
        phase: result.session.phase,
        status: result.session.status,
        help_ladder: result.session.help_ladder,
        current_group: result.session.current_group,
        pending_question: result.session.pending_question,
        struggled: result.session.struggled,
        said_once: result.session.said_once,
        survival_used: result.session.survival_used,
      },
      visual: pack.visual,
      character_id: pack.scene.character_id,
      item_surfaces: surfaces,
      bridge_tl: pack.bridge?.tl ?? '',
      free_topic_id: freeTopicIdForPack(pack.pack_id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
