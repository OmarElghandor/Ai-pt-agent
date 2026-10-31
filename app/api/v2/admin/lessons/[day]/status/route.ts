import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import {
  getLatestLesson,
  getLessonVersion,
  setLessonStatus,
} from '@/lib/v2/generation/lesson/save';
import {
  PublishLessonError,
  publishLesson,
} from '@/lib/v2/generation/lesson/publish';
import { isBlockedForPublish } from '@/lib/v2/generation/lesson/issueResolve';
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
    if (body.status === 'published') {
      const result = await publishLesson({
        day,
        version: body.version,
      });
      return NextResponse.json({
        day: result.lesson.day,
        version: result.lesson.version,
        status: result.lesson.status,
        registry: result.registry,
      });
    }

    if (body.status === 'reviewed') {
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

    const saved = await setLessonStatus({
      day,
      status: body.status as 'draft' | 'reviewed',
      version: body.version,
    });

    return NextResponse.json({
      day: saved.day,
      version: saved.version,
      status: saved.status,
      registry: null,
    });
  } catch (err) {
    if (err instanceof PublishLessonError) {
      const status =
        err.code === 'not_found'
          ? 404
          : err.code === 'registry'
            ? 409
            : err.code === 'mongo'
              ? 503
              : 400;
      return NextResponse.json(
        { error: err.message, code: err.code, details: err.details },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
