import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2MicroClipModel } from '@/lib/v2/mongo/microModels';
import { normaliseBox, isValidFractionBox } from '@/lib/v2/micro/images';

export const runtime = 'nodejs';

/** Admin drag/resize scene boxes (web-only). */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    line_index: number;
    box: { x: number; y: number; w: number; h: number };
  };
  await connectMongo();
  const clip = await V2MicroClipModel().findById(id);
  if (!clip) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const idx = body.line_index;
  if (idx < 0 || idx >= (clip.lines?.length ?? 0)) {
    return NextResponse.json({ error: 'bad line_index' }, { status: 400 });
  }
  const box = normaliseBox(body.box);
  if (!isValidFractionBox(box)) {
    return NextResponse.json({ error: 'invalid box' }, { status: 400 });
  }
  clip.lines[idx]!.box = box;
  clip.lines[idx]!.box_flagged = false;
  await clip.save();
  return NextResponse.json({ ok: true, box });
}
