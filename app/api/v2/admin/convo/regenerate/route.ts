import { NextResponse } from 'next/server';
import { clearCachedAudioForTexts } from '@/lib/audioCache';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { enqueueAndStartGenerateConvoPack } from '@/lib/v2/generation/jobs';
import { enqueueOrJoinPrepareDay } from '@/lib/v2/generation/prepare';
import { collectConvoSegments } from '@/lib/v2/generation/convo/warmAudio';
import { warmConvoPackAudio } from '@/lib/v2/generation/convo/warmAudio';
import {
  clearConvoItemSurfacesCache,
  loadConvoItemSurfaces,
  packIdToDay,
  requireConvoPackAsync,
} from '@/lib/v2/convo/pack';
import { freePackId, MongoConvoSessionStore } from '@/lib/v2/convo/session';

export const runtime = 'nodejs';
export const maxDuration = 300;

type RegenAction =
  | 'reset'
  | 'reload_pack'
  | 'regenerate_day'
  | 'clear_audio';

const regenerateDayLast = new Map<string, number>();

function resolvePackId(body: {
  pack_id?: string;
  topic_id?: string;
}): string | null {
  const pack = body.pack_id?.trim();
  if (pack) return pack;
  const topic = body.topic_id?.trim();
  if (topic) return freePackId(topic);
  return null;
}

/**
 * Dev regenerate menu actions for Learn / free talk.
 * Body: { pack_id | topic_id, action }
 */
export async function POST(req: Request) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  const adminId = getCurrentUserId() ?? 'anonymous';
  const body = (await req.json().catch(() => null)) as {
    pack_id?: string;
    topic_id?: string;
    action?: RegenAction;
  } | null;

  const action = body?.action;
  const packId = body ? resolvePackId(body) : null;
  if (
    !action ||
    !['reset', 'reload_pack', 'regenerate_day', 'clear_audio'].includes(action)
  ) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }
  if (!packId) {
    return NextResponse.json(
      { error: 'pack_id or topic_id required' },
      { status: 400 },
    );
  }

  console.info('[admin/convo/regenerate]', {
    admin_id: adminId,
    action,
    pack_id: packId,
    at: new Date().toISOString(),
  });

  const store = new MongoConvoSessionStore();
  const userId = getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    if (action === 'reset') {
      const deleted = await store.deleteOpen(userId, packId);
      return NextResponse.json({ ok: true, action, deleted });
    }

    if (action === 'reload_pack') {
      clearConvoItemSurfacesCache();
      const deleted = await store.deleteOpen(userId, packId);
      if (packId.startsWith('free.')) {
        return NextResponse.json({
          ok: true,
          action,
          deleted,
          preparing: false,
        });
      }
      const surfaces = loadConvoItemSurfaces();
      let pack;
      try {
        pack = await requireConvoPackAsync(packId, { itemSurfaces: surfaces });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 400 });
      }
      if (!pack.authored) {
        const day = packIdToDay(packId) ?? pack.day;
        const enqueued = await enqueueAndStartGenerateConvoPack({ day });
        return NextResponse.json({
          ok: true,
          action,
          deleted,
          preparing: true,
          job: enqueued,
        });
      }
      return NextResponse.json({
        ok: true,
        action,
        deleted,
        preparing: false,
      });
    }

    if (action === 'regenerate_day') {
      const day = packIdToDay(packId);
      if (day == null) {
        return NextResponse.json(
          { error: 'could not resolve day from pack_id' },
          { status: 400 },
        );
      }
      const key = `${adminId}:${day}`;
      const last = regenerateDayLast.get(key) ?? 0;
      if (Date.now() - last < 120_000) {
        return NextResponse.json(
          { error: 'rate_limited', retry_after_ms: 120_000 - (Date.now() - last) },
          { status: 429 },
        );
      }
      regenerateDayLast.set(key, Date.now());
      const deleted = await store.deleteOpen(userId, packId);
      const enqueued = await enqueueOrJoinPrepareDay({
        day,
        force: true,
        startWorker: true,
      });
      return NextResponse.json({
        ok: true,
        action,
        deleted,
        preparing: true,
        job: enqueued,
      });
    }

    // clear_audio
    if (packId.startsWith('free.')) {
      return NextResponse.json(
        { error: 'clear_audio requires a Learn pack_id' },
        { status: 400 },
      );
    }
    clearConvoItemSurfacesCache();
    const surfaces = loadConvoItemSurfaces();
    const pack = await requireConvoPackAsync(packId, { itemSurfaces: surfaces });
    const segments = collectConvoSegments(pack);
    const cleared = clearCachedAudioForTexts(
      segments.map((s) => ({ lang: s.lang, text: s.text })),
    );
    const warmed = await warmConvoPackAudio(pack);
    return NextResponse.json({
      ok: true,
      action,
      cleared,
      warmed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
