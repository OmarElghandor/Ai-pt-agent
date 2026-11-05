import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/currentUser';
import { isV2Enabled } from '@/lib/v2/flags';
import { loadFreeTopicsFile } from '@/lib/v2/convo/topics';
import { MongoConvoSessionStore } from '@/lib/v2/convo/session';

export const runtime = 'nodejs';

/** GET free-chat topics catalogue (09 §10 / Batch 10 D2). */
export async function GET() {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'v2 disabled' }, { status: 403 });
  }
  try {
    const file = loadFreeTopicsFile();
    const resumeIds = new Set<string>();
    const userId = getCurrentUserId();
    if (userId) {
      const store = new MongoConvoSessionStore();
      const openIds = await store.findOpenFreeTopicIds(userId);
      for (const id of openIds) resumeIds.add(id);
    }
    return NextResponse.json({
      target_lang: file.target_lang,
      topics: file.topics.map((t) => ({
        id: t.id,
        title_tl: t.title_tl,
        title_ar: t.title_ar,
        character_id: t.character_id,
        can_resume: resumeIds.has(t.id),
      })),
      open_can_resume: resumeIds.has('open'),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'load failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
