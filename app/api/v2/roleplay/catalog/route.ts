import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { buildRoleplayCatalog } from '@/lib/v2/roleplay/catalog';
import { MongoRoleplaySessionStore } from '@/lib/v2/roleplay/store';

export const runtime = 'nodejs';

/** Role-play path: next scene + past finished calls. */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const store = new MongoRoleplaySessionStore();
  try {
    const [finishedIds, activeBySituation] = await Promise.all([
      store.listFinishedSituationIds(userId),
      store.listActiveBySituation(userId),
    ]);
    const catalog = buildRoleplayCatalog({
      finishedIds,
      activeBySituation,
      activeSituationIds: Object.keys(activeBySituation),
    });
    return NextResponse.json(catalog);
  } catch (err) {
    if (err instanceof Error && err.message === 'mongo_unavailable') {
      return NextResponse.json({ error: 'mongo_unavailable' }, { status: 503 });
    }
    throw err;
  }
}
