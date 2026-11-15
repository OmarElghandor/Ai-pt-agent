import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured } from '@/lib/mongo';
import { libraryErrorResponse } from '@/lib/v2/library/routeErrors';
import { getEpisodeImages, setEpisodeImage } from '@/lib/v2/library/images';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  try {
    const { slug } = await ctx.params;
    return NextResponse.json(await getEpisodeImages(slug));
  } catch (e) {
    return libraryErrorResponse(e);
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  try {
    const { slug } = await ctx.params;
    const body = (await req.json()) as {
      key: string;
      url?: string;
      spec?: string;
      /** Stub generate: marks ready with a placeholder url. */
      generate?: boolean;
    };
    if (!body.key) {
      return NextResponse.json({ error: 'key required' }, { status: 400 });
    }
    if (body.generate) {
      await setEpisodeImage(slug, body.key, {
        url: body.url ?? `stub://generated/${body.key}`,
        status: 'ready',
        spec: body.spec,
      });
    } else {
      await setEpisodeImage(slug, body.key, {
        url: body.url,
        status: body.url ? 'ready' : undefined,
        spec: body.spec,
      });
    }
    return NextResponse.json({ ok: true, ...(await getEpisodeImages(slug)) });
  } catch (e) {
    return libraryErrorResponse(e);
  }
}
