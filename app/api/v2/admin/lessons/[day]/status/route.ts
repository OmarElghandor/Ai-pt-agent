import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  getLatestLesson,
  getLessonVersion,
  setLessonStatus,
} from '@/lib/v2/generation/lesson/save';
import { publishItemsToRegistry } from '@/lib/v2/generation/lesson/registry';
import { isBlockedForPublish } from '@/lib/v2/generation/lesson/issueResolve';
import type { Item } from '@/lib/v2/content/items';
import { mongoConfigured } from '@/lib/mongo';
import { hasErrors, validateLessonPack } from '@/lib/v2/content/validate';

export const runtime = 'nodejs';

const ALLOWED = new Set(['draft', 'reviewed', 'published']);

export async function POST(
  req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  let body: { status?: string; version?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json(
      { error: 'status must be draft | reviewed | published' },
      { status: 400 },
    );
  }

  try {
    if (body.status === 'reviewed' || body.status === 'published') {
      const lesson =
        body.version != null
          ? await getLessonVersion(day, body.version)
          : await getLatestLesson(day);
      if (!lesson) {
        return NextResponse.json({ error: 'No lesson for day' }, { status: 404 });
      }
      if (isBlockedForPublish(lesson.meta)) {
        return NextResponse.json(
          { error: 'Cannot mark reviewed/published while flagged' },
          { status: 400 },
        );
      }
      const validation = validateLessonPack(lesson.data, { mode: 'strict' });
      if (hasErrors(validation)) {
        return NextResponse.json(
          {
            error: 'Strict validation failed',
            issues: validation.issues.filter((i) => i.severity === 'error'),
          },
          { status: 400 },
        );
      }
    }

    let registry: { written: number; conflicts: string[] } | null = null;
    if (body.status === 'published') {
      const lesson =
        body.version != null
          ? await getLessonVersion(day, body.version)
          : await getLatestLesson(day);
      if (lesson) {
        registry = await publishItemsToRegistry({
          day,
          targetLang: lesson.target_lang,
          items: (lesson.data.items as Item[]) ?? [],
        });
        if (registry.conflicts.length) {
          return NextResponse.json(
            {
              error: 'Registry tl conflicts',
              conflicts: registry.conflicts,
            },
            { status: 409 },
          );
        }
      }
    }

    const saved = await setLessonStatus({
      day,
      status: body.status as 'draft' | 'reviewed' | 'published',
      version: body.version,
    });

    if (body.status === 'published' && saved) {
      const { markPacksStaleForLesson } = await import(
        '@/lib/v2/generation/pack/save'
      );
      await markPacksStaleForLesson({
        day,
        targetLang: saved.target_lang,
        lessonVersion: saved.version,
      });
    }
    return NextResponse.json({
      day: saved.day,
      version: saved.version,
      status: saved.status,
      registry,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
