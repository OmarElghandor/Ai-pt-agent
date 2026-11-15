import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import {
  ReorderError,
  reorderEpisodes,
} from '@/lib/v2/library/reorderEpisodes';

export const runtime = 'nodejs';

export async function PATCH(req: Request) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  let body: { level?: unknown; slugs?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const level = Number(body.level);
  if (
    !Array.isArray(body.slugs) ||
    body.slugs.some((s) => typeof s !== 'string')
  ) {
    return NextResponse.json({ error: 'slugs must be string[]' }, { status: 400 });
  }
  try {
    const result = await reorderEpisodes(level, body.slugs as string[]);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ReorderError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
