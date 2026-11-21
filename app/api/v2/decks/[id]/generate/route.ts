import { NextResponse } from 'next/server';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { mongoConfigured } from '@/lib/mongo';
import { ensureSituationCardBank } from '@/lib/v2/decks/situationBank';
import { isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const userId = await getCurrentV2UserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const deckId = decodeURIComponent(id);
  if (!deckId.startsWith('day:')) {
    return NextResponse.json(
      { error: 'only_situation', message_eg: 'التوليد للمواقف بس' },
      { status: 400 },
    );
  }
  const day = Number(deckId.slice(4));
  if (!Number.isFinite(day) || day < 1) {
    return NextResponse.json({ error: 'bad_day' }, { status: 400 });
  }

  const result = await ensureSituationCardBank({ day });

  if (result.status === 'failed') {
    return NextResponse.json(
      {
        status: 'failed',
        message_eg: result.message_eg,
        item_count: 0,
      },
      { status: 500 },
    );
  }

  if (result.status === 'generating') {
    return NextResponse.json({
      status: 'generating',
      message_eg: 'بنجهّز الكروت…',
      item_count: 0,
    });
  }

  return NextResponse.json({
    status: 'ready',
    source: result.source,
    item_count: result.items.length,
  });
}
