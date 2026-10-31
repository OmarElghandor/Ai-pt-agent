import { NextResponse } from 'next/server';
import { TTSNotConfiguredError } from '@/lib/tts';
import { ensureStoryLineAudio } from '@/lib/v2/storyAudio';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; lineIndex: string }> },
) {
  try {
    const { id, lineIndex: rawIndex } = await ctx.params;
    const lineIndex = Number(rawIndex);
    if (!Number.isInteger(lineIndex) || lineIndex < 0) {
      return NextResponse.json({ error: 'bad_line_index' }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      speed?: 'normal' | 'slow';
      version?: number;
      speaker?: string;
    };
    const speed = body.speed === 'slow' ? 'slow' : 'normal';
    const result = await ensureStoryLineAudio({
      storyId: decodeURIComponent(id),
      version: body.version,
      lineIndex,
      speed,
      speaker: body.speaker,
    });

    if (!result.buffer) {
      return NextResponse.json(
        { error: 'no_audio', key: result.key },
        { status: 500 },
      );
    }

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': result.contentType ?? 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Story-Audio-Key': result.key,
        'X-Story-Audio-Cached': result.cached ? '1' : '0',
      },
    });
  } catch (err) {
    if (err instanceof TTSNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: 'TTS_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    const message = err instanceof Error ? err.message : 'tts_failed';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
