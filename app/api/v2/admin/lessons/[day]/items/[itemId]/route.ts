import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { rehashAfterItemEdit } from '@/lib/v2/generation/lesson/graph';
import {
  getLatestLesson,
  getLessonVersion,
  updateDraft,
} from '@/lib/v2/generation/lesson/save';
import type { Item } from '@/lib/v2/content/items';
import { mongoConfigured } from '@/lib/mongo';

export const runtime = 'nodejs';

/**
 * Hand-edit one item on the draft pack, then rehash dependents (stale only if done).
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ day: string; itemId: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }

  const { day: dayRaw, itemId } = await ctx.params;
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 1 || day > 90 || !itemId) {
    return NextResponse.json({ error: 'invalid day or itemId' }, { status: 400 });
  }

  let body: { version?: number; patch?: Record<string, unknown> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.patch || typeof body.patch !== 'object') {
    return NextResponse.json({ error: 'patch object required' }, { status: 400 });
  }

  try {
    const lesson =
      body.version != null
        ? await getLessonVersion(day, body.version)
        : await getLatestLesson(day);
    if (!lesson) {
      return NextResponse.json({ error: 'No lesson for day' }, { status: 404 });
    }

    const items = [...((lesson.data.items as Item[]) ?? [])];
    const idx = items.findIndex((i) => i.id === itemId);
    if (idx < 0) {
      return NextResponse.json({ error: `item ${itemId} not found` }, { status: 404 });
    }

    const next = { ...items[idx], ...body.patch, id: itemId } as Item;
    items[idx] = next;

    await updateDraft({
      day,
      targetLang: lesson.target_lang,
      version: lesson.version,
      pack: { ...lesson.data, items },
      mergeMeta: true,
    });

    const staleIds = await rehashAfterItemEdit({
      day,
      version: lesson.version,
      targetLang: lesson.target_lang,
      items,
    });

    return NextResponse.json({
      ok: true,
      day,
      version: lesson.version,
      item: next,
      stale_job_ids: staleIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
