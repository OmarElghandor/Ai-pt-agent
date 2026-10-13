import { NextResponse } from 'next/server';
import { ensureMongoLesson, refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { findSlot, generateLessonDirect } from '@/lib/generation/runPipeline';
import { generationStageLabel } from '@/lib/generationLabels';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';
/** Generation can take several Claude round-trips. */
export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lessonKey: string }> },
) {
  const { lessonKey } = await ctx.params;
  const force = new URL(req.url).searchParams.get('force') === '1';
  if (!lessonKey) {
    return NextResponse.json({ error: 'lessonKey required' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Mongo مش متضبطة — لازم MONGODB_URI' },
      { status: 400 },
    );
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.CLAUDE_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'ANTHROPIC_API_KEY مش متضبطة في .env.local' },
      { status: 503 },
    );
  }

  if (!findSlot(lessonKey)) {
    return NextResponse.json({ ok: false, error: 'درس مش موجود في الخطة' }, { status: 404 });
  }

  try {
    await refreshMongoCatalogue(true);
    const existing = await ensureMongoLesson(lessonKey);
    // Only short-circuit when an aligned bilingual pack is already playable.
    if (existing && !force) {
      return NextResponse.json({
        ok: true,
        alreadyLive: true,
        hasPack: true,
        stageLabel: 'جاهز',
        packId: existing.id,
      });
    }

    // Direct HTTP to Anthropic — no job queue / worker.
    // ?force=1 rewrites a live pack. A stale teach-step pack regenerates either way.
    const result = await generateLessonDirect(lessonKey, { force });
    await refreshMongoCatalogue(true);
    const pack = result.ok ? await ensureMongoLesson(lessonKey) : null;

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || 'فشل التوليد — حاول تاني',
          stage: result.stage ?? null,
          stageLabel: generationStageLabel(result.stage),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      alreadyLive: false,
      hasPack: Boolean(pack),
      stage: 'done',
      stageLabel: 'جاهز',
      packId: pack?.id ?? lessonKey,
    });
  } catch (err) {
    console.error('[api/lessons/generate]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'فشل التوليد' },
      { status: 500 },
    );
  }
}
