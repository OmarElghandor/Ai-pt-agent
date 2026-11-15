import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { learnerConvoLevel } from '@/lib/v2/convo/level/learnerLevel';
import { buildRoleplayCatalog } from '@/lib/v2/roleplay/catalog';
import { MongoRoleplayStarsStore } from '@/lib/v2/roleplay/store';

export const runtime = 'nodejs';

/** Role-play list: 5 levels × situations + stars + hard badge. */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const learnerDay = await learnerConvoLevel(userId);
  const stars = await new MongoRoleplayStarsStore().getAllStars(userId);
  const catalog = buildRoleplayCatalog({
    learnerDay,
    starsBySituation: stars,
  });
  return NextResponse.json(catalog);
}
