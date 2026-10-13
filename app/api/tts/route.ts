import { NextResponse } from 'next/server';
import { readCachedAudio } from '@/lib/audioCache';
import { refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { findRemoteAudioUrl } from '@/lib/remoteAudio';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { lang, text } = (await req.json()) as {
      lang?: 'pt' | 'ar';
      text?: string;
    };

    if (!lang || !text?.trim()) {
      return NextResponse.json(
        { error: 'lang and text are required' },
        { status: 400 },
      );
    }

    if (lang !== 'pt' && lang !== 'ar') {
      return NextResponse.json({ error: 'lang must be pt or ar' }, { status: 400 });
    }

    const trimmed = text.trim();
    await refreshMongoCatalogue().catch(() => 0);
    const remoteUrl = findRemoteAudioUrl(lang, trimmed);
    if (remoteUrl) {
      const remote = await fetch(remoteUrl);
      if (remote.ok) {
        const buffer = Buffer.from(await remote.arrayBuffer());
        const contentType = remote.headers.get('content-type') || 'audio/mpeg';
        return new Response(new Uint8Array(buffer), {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store',
          },
        });
      }
    }

    const cached = readCachedAudio(lang, trimmed);
    const { buffer, contentType } = cached
      ? cached
      : await speakSegment({
          lang,
          text: trimmed,
        });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof TTSNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: 'TTS_NOT_CONFIGURED' },
        { status: 503 },
      );
    }
    console.error('[api/tts]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'TTS failed' },
      { status: 500 },
    );
  }
}
