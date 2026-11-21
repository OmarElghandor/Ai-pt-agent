import { NextResponse } from 'next/server';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { buildSituationDeckSession } from '@/lib/v2/decks/session';
import { isV2Enabled } from '@/lib/v2/flags';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const user = await getCurrentV2User();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const deckId = decodeURIComponent(id);
  if (!deckId.startsWith('day:')) {
    return NextResponse.json({ error: 'only_situation' }, { status: 400 });
  }

  const tz = req.headers.get('x-timezone') ?? user.timezone ?? 'Europe/Lisbon';
  const local_date = userLocalDate(tz);

  const session = await buildSituationDeckSession({
    user_id: user.id,
    deckId,
    local_date,
  });
  if (!session) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(session);
}
