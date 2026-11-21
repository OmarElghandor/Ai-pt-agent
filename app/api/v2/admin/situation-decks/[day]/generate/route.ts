import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { ensureSituationCardBank } from '@/lib/v2/decks/situationBank';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Admin: force-regenerate the situation flashcard bank for a plan day.
 * Overwrites an existing ready/failed bank. Never writes v2_lessons.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'bad_day' }, { status: 400 });
  }

  const result = await ensureSituationCardBank({ day, force: true });

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
