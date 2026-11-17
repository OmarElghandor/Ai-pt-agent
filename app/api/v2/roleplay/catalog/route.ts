import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import {
  buildSceneCatalog,
  listActiveScenesByTopic,
  listFinishedSceneIds,
} from '@/lib/v2/convo/scenes';
import { MongoConvoSessionStore } from '@/lib/v2/convo/session';

export const runtime = 'nodejs';

/**
 * Role-play path catalog (scenes on free-talk).
 * Same shape as batch-rp-1 so RoleplayListScreen keeps working.
 */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const store = new MongoConvoSessionStore();
  try {
    const [finishedIds, activeByScene] = await Promise.all([
      listFinishedSceneIds(store, userId),
      listActiveScenesByTopic(store, userId),
    ]);
    const catalog = buildSceneCatalog({
      finishedIds,
      activeByScene,
    });
    return NextResponse.json(catalog);
  } catch (err) {
    if (err instanceof Error && err.message === 'mongo_unavailable') {
      return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
    }
    throw err;
  }
}
