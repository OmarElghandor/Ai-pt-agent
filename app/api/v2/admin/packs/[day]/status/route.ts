import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { validatePracticePack } from '@/lib/v2/content/validatePack';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import {
  getLatestPack,
  setPackStatus,
} from '@/lib/v2/generation/pack/save';

export const runtime = 'nodejs';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ day: string }> },
) {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;

  const { day: dayStr } = await ctx.params;
  const day = Number(dayStr);
  if (!Number.isInteger(day) || day < 1) {
    return NextResponse.json({ error: 'invalid day' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    version?: number;
  } | null;
  const status = body?.status;
  if (status !== 'draft' && status !== 'reviewed' && status !== 'published') {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const latest = await getLatestPack(day);
  if (!latest) {
    return NextResponse.json({ error: 'no pack' }, { status: 404 });
  }
  const version = body?.version ?? latest.version;
  const pack =
    version === latest.version
      ? latest
      : await getLatestPack(day); // fallback
  if (!pack) {
    return NextResponse.json({ error: 'no pack' }, { status: 404 });
  }

  if (status === 'published' || status === 'reviewed') {
    if (pack.meta?.flagged) {
      return NextResponse.json(
        { error: 'pack flagged — fix before publish' },
        { status: 400 },
      );
    }
    const lesson = await getPublishedLesson(day);
    const items = lesson?.pack.items ?? [];
    const v = validatePracticePack(pack.data, { items });
    if (!v.ok) {
      return NextResponse.json(
        { error: 'invalid pack', issues: v.issues },
        { status: 400 },
      );
    }
  }

  const updated = await setPackStatus({ day, version, status });
  return NextResponse.json(updated);
}
