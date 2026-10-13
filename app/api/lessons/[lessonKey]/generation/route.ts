import { NextResponse } from 'next/server';
import { ensureMongoLesson, isJsonLesson, refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { generationStageLabel } from '@/lib/generationLabels';
import { getGenerationStatusFromMongo } from '@/lib/mongo/practiceLesson';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

/** Status from practice_lessons only (optional; generate now awaits Claude inline). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ lessonKey: string }> },
) {
  const { lessonKey } = await ctx.params;
  if (!lessonKey) {
    return NextResponse.json({ error: 'lessonKey required' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json({
      ok: true,
      hasPack: true,
      jsonLesson: isJsonLesson(lessonKey),
      status: 'live',
      stage: 'done',
      stageLabel: 'جاهز',
    });
  }

  try {
    if (isJsonLesson(lessonKey)) {
      return NextResponse.json({
        ok: true,
        hasPack: true,
        jsonLesson: true,
        status: 'live',
        stage: 'done',
        stageLabel: 'جاهز',
      });
    }

    const mongoStatus = await getGenerationStatusFromMongo(lessonKey);
    await refreshMongoCatalogue(true);
    const pack = await ensureMongoLesson(lessonKey);

    return NextResponse.json({
      ok: true,
      hasPack: Boolean(pack),
      jsonLesson: false,
      status: mongoStatus?.status ?? null,
      stage: mongoStatus?.stage ?? null,
      stageLabel: generationStageLabel(mongoStatus?.stage),
      error: mongoStatus?.error ?? null,
    });
  } catch (err) {
    console.error('[api/lessons/generation]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'status failed' },
      { status: 500 },
    );
  }
}
