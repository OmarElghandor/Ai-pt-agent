import { NextResponse } from 'next/server';
import { isV2Enabled } from '@/lib/v2/flags';
import { loadFreeTopicsFile } from '@/lib/v2/convo/topics';

export const runtime = 'nodejs';

/** GET free-chat topics catalogue (09 §10 / T7.2). */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  try {
    const file = loadFreeTopicsFile();
    return NextResponse.json({
      target_lang: file.target_lang,
      topics: file.topics.map((t) => ({
        id: t.id,
        title_tl: t.title_tl,
        title_ar: t.title_ar,
        character_id: t.character_id,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
