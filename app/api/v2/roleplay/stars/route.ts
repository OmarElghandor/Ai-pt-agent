import { NextResponse } from 'next/server';
import {
  getCurrentV2User,
  getCurrentV2UserId,
} from '@/lib/v2/auth/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { MongoRoleplayStarsStore } from '@/lib/v2/roleplay/store';

export const runtime = 'nodejs';

/** GET stars for the current learner (all situations). */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }

  const user = await getCurrentV2User();
  const userId = user?.id ?? (await getCurrentV2UserId());
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const store = new MongoRoleplayStarsStore();
  const stars = await store.getAllStars(userId);
  return NextResponse.json({ stars });
}
