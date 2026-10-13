import { NextResponse } from 'next/server';
import { refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { getLearnerLessonPlan } from '@/lib/lessons/plan';
import { readLearner } from '@/lib/store';
import { warmKnownCache } from '@/lib/knownCache';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const learnerId = url.searchParams.get('id') ?? '';
  if (!learnerId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    await refreshMongoCatalogue();
    await warmKnownCache(learnerId);

    let localLessons: Record<string, { practisedAt?: number }> | undefined;
    try {
      const file = readLearner(learnerId);
      localLessons = Object.fromEntries(
        Object.entries(file.progress.lessons).map(([k, v]) => [
          k,
          { practisedAt: v.practisedAt },
        ]),
      );
    } catch {
      localLessons = undefined;
    }

    const plan = await getLearnerLessonPlan(learnerId, localLessons);
    return NextResponse.json(plan);
  } catch (err) {
    console.error('[api/lessons/plan]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'plan failed' },
      { status: 500 },
    );
  }
}
