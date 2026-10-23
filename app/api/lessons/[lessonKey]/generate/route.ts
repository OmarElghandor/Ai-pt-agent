import { NextResponse } from 'next/server';
import { ensureMongoLesson, refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { findSlot, generateLessonDirect } from '@/lib/generation/runPipeline';
import { generationStageLabel } from '@/lib/generationLabels';
import { mongoConfigured } from '@/lib/mongo';
import { getCurrentPracticeLesson } from '@/lib/mongo/practiceLesson';

export const runtime = 'nodejs';
/** Generation can take several Claude round-trips. */
export const maxDuration = 300;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lessonKey: string }> },
) {
  const { lessonKey } = await ctx.params;
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const overwriteHand = url.searchParams.get('overwrite_hand') === '1';
  if (!lessonKey) {
    return NextResponse.json({ error: 'lessonKey required' }, { status: 400 });
  }

  if (!mongoConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Mongo مش متضبطة — لازم MONGODB_URI' },
      { status: 400 },
    );
  }

  if (!findSlot(lessonKey)) {
    return NextResponse.json({ ok: false, error: 'درس مش موجود في الخطة' }, { status: 404 });
  }

  try {
    await refreshMongoCatalogue(true);
    const currentDoc = await getCurrentPracticeLesson(lessonKey);
    const isHand = currentDoc?.source === 'hand';

    // Hand packs stay put unless overwrite_hand=1 (even with ?force=1).
    if (isHand && !overwriteHand) {
      const existing = await ensureMongoLesson(lessonKey);
      if (existing) {
        if (force) {
          return NextResponse.json(
            {
              ok: false,
              error: 'الدرس مكتوب يدوي — لازم overwrite_hand=1 عشان تعيد توليده',
              alreadyLive: true,
              hasPack: true,
              source: 'hand',
              stageLabel: 'جاهز',
              packId: existing.id,
            },
            { status: 409 },
          );
        }
        return NextResponse.json({
          ok: true,
          alreadyLive: true,
          hasPack: true,
          source: 'hand',
          stageLabel: 'جاهز',
          packId: existing.id,
        });
      }
    }

    const existing = await ensureMongoLesson(lessonKey);
    // Only short-circuit when an aligned bilingual pack is already playable.
    if (existing && !force && !overwriteHand) {
      return NextResponse.json({
        ok: true,
        alreadyLive: true,
        hasPack: true,
        stageLabel: 'جاهز',
        packId: existing.id,
      });
    }

    if (!process.env.ANTHROPIC_API_KEY?.trim() && !process.env.CLAUDE_API_KEY?.trim()) {
      return NextResponse.json(
        { ok: false, error: 'ANTHROPIC_API_KEY مش متضبطة في .env.local' },
        { status: 503 },
      );
    }

    // Direct HTTP to Anthropic — no job queue / worker.
    // ?force=1 rewrites a live pack. Hand packs need overwrite_hand=1.
    const result = await generateLessonDirect(lessonKey, { force, overwriteHand });
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
