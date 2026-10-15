import { NextResponse } from 'next/server';
import {
  ensureMongoLesson,
  isJsonLesson,
  lessonById,
  refreshMongoCatalogue,
} from '@/lib/lessons/catalogue';
import type { LessonPack } from '@/lib/lessons/types';
import { generationStageLabel } from '@/lib/generationLabels';
import { getGenerationStatusFromMongo } from '@/lib/mongo/practiceLesson';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

/** Unique Portuguese strings from scenes[].words for client TTS prefetch. */
export function sceneWordWarmPt(pack: LessonPack | null | undefined): string[] {
  if (!pack) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const scene of pack.scenes) {
    for (const word of scene.words ?? []) {
      const pt = word.pt.trim();
      if (!pt || seen.has(pt)) continue;
      seen.add(pt);
      out.push(pt);
    }
  }
  return out;
}

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
    const pack = lessonById(lessonKey);
    return NextResponse.json({
      ok: true,
      hasPack: Boolean(pack) || isJsonLesson(lessonKey),
      jsonLesson: isJsonLesson(lessonKey),
      status: 'live',
      stage: 'done',
      stageLabel: 'جاهز',
      sceneWordWarmPt: sceneWordWarmPt(pack),
    });
  }

  try {
    if (isJsonLesson(lessonKey)) {
      const pack = lessonById(lessonKey);
      return NextResponse.json({
        ok: true,
        hasPack: true,
        jsonLesson: true,
        status: 'live',
        stage: 'done',
        stageLabel: 'جاهز',
        sceneWordWarmPt: sceneWordWarmPt(pack),
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
      sceneWordWarmPt: sceneWordWarmPt(pack),
    });
  } catch (err) {
    console.error('[api/lessons/generation]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'status failed' },
      { status: 500 },
    );
  }
}
