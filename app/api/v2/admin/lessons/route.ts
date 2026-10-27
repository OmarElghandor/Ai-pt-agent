import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';
import {
  listLatestLessons,
  type SavedLesson,
} from '@/lib/v2/generation/lesson/save';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

const MONGO_LIST_TIMEOUT_MS = 5_000;

async function listLessonsOrEmpty(targetLang: string): Promise<{
  lessons: SavedLesson[];
  mongoError?: string;
}> {
  if (!mongoConfigured()) {
    return { lessons: [], mongoError: 'MongoDB not configured' };
  }
  try {
    const lessons = await Promise.race([
      listLatestLessons(targetLang),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Mongo list timed out after ${MONGO_LIST_TIMEOUT_MS}ms`)),
          MONGO_LIST_TIMEOUT_MS,
        );
      }),
    ]);
    return { lessons };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[v2-admin lessons]', message);
    return { lessons: [], mongoError: message };
  }
}

export async function GET() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  try {
    const plan = loadPlan();
    const { lessons, mongoError } = await listLessonsOrEmpty(plan.target_lang);
    const byDay = new Map(lessons.map((l) => [l.day, l]));

    const rows = plan.days.map((d) => {
      const lesson = byDay.get(d.day);
      const gen = d.generation;
      const ready =
        Boolean(gen?.new_items?.words?.length || gen?.new_items?.phrases?.length) ||
        d.is_story;
      return {
        day: d.day,
        week: d.week,
        title_tl: d.title_tl,
        title_ar: d.title_ar,
        situation_eg: d.situation_eg,
        example_tl: d.example_tl,
        is_story: d.is_story,
        can_generate: ready && Boolean(gen?.page_plan?.length),
        status: lesson?.status ?? null,
        version: lesson?.version ?? null,
        flagged: lesson?.meta?.flagged ?? false,
        cost: lesson?.meta?.cost ?? null,
      };
    });

    return NextResponse.json({
      target_lang: plan.target_lang,
      days: rows,
      ...(mongoError ? { warning: mongoError } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[v2-admin lessons]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
