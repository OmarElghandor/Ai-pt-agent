import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { isV2DevAllowed, isV2Enabled } from '@/lib/v2/flags';

export const runtime = 'nodejs';

/**
 * Dev-only: serve files from data/v2-images so local storage urls work in the browser.
 * Readable when V2 is enabled in non-production (or V2_DEV); write/admin still gated.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  if (!isV2Enabled()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (process.env.NODE_ENV === 'production' && !isV2DevAllowed()) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // When CLOUDINARY_URL is set we still allow this for leftover local files in admin.
  const { filename: raw } = await ctx.params;
  const filename = decodeURIComponent(raw);
  if (
    !filename ||
    filename.includes('..') ||
    filename.includes('/') ||
    filename.includes('\\') ||
    !/\.(png|jpe?g|webp)$/i.test(filename)
  ) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
  }
  const full = path.join(process.cwd(), 'data', 'v2-images', filename);
  if (!existsSync(full)) {
    return new NextResponse(null, { status: 404 });
  }
  const buf = readFileSync(full);
  const type = filename.endsWith('.webp')
    ? 'image/webp'
    : filename.endsWith('.jpg') || filename.endsWith('.jpeg')
      ? 'image/jpeg'
      : 'image/png';
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/** Block accidental POSTs without admin. */
export async function POST() {
  const denied = denyUnlessV2Admin();
  if (denied) return denied;
  return NextResponse.json({ error: 'method not allowed' }, { status: 405 });
}
