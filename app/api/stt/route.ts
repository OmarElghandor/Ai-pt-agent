import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // Whisper limit

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY not configured' },
      { status: 503 },
    );
  }

  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'file is required' },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: 'empty audio' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'audio too large' },
        { status: 413 },
      );
    }

    const upstream = new FormData();
    upstream.append('file', file, file.name || 'speech.webm');
    upstream.append('model', process.env.WHISPER_MODEL || 'whisper-1');
    // No language — auto-detect AR / PT for bilingual practice

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[stt] Whisper error:', res.status, errText.slice(0, 300));
      return NextResponse.json(
        { error: 'Whisper transcription failed' },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text?.trim() ?? '' });
  } catch (err) {
    console.error('[stt]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'STT failed' },
      { status: 500 },
    );
  }
}
