export class TTSNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTSNotConfiguredError';
  }
}

export type TtsResult = {
  buffer: Buffer;
  contentType: string;
};

const RUNPOD_URL = process.env.OMNITTS_TTS_URL!;
const RUNPOD_KEY = process.env.OMNITTS_TTS_API_KEY!;
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_PT_VOICE = process.env.AZURE_PT_VOICE || 'pt-PT-RaquelNeural';

function omniInput(text: string) {
  // VoiceTut / OmniTTS RunPod handler schema:
  // { input: { input, speaker, language, num_step } }
  return {
    input: text,
    speaker: process.env.OMNITTS_TTS_SPEAKER || 'Sarah',
    language: process.env.OMNITTS_TTS_LANGUAGE || 'arz',
    num_step: Number(process.env.OMNITTS_TTS_NUM_STEP) || 16,
  };
}

/** Pinned after first successful playback: output.audio_base64 (WAV). */
function extractAudio(output: Record<string, unknown> | null | undefined): TtsResult {
  if (!output || typeof output.audio_base64 !== 'string') {
    throw new Error(
      `RunPod TTS: expected output.audio_base64, got keys: ${Object.keys(output ?? {}).join(', ')}`,
    );
  }
  const contentType =
    typeof output.content_type === 'string'
      ? output.content_type
      : 'audio/wav';
  return {
    buffer: Buffer.from(output.audio_base64, 'base64'),
    contentType,
  };
}

function unwrapOutput(
  output: Record<string, unknown> | Record<string, unknown>[] | undefined,
): Record<string, unknown> | undefined {
  if (!output) return undefined;
  return Array.isArray(output) ? output[0] : output;
}

async function speakArabicRunsync(text: string): Promise<TtsResult> {
  const syncUrl = RUNPOD_URL.replace(/\/run$/, '/runsync');
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNPOD_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: omniInput(text) }),
  });

  const json = (await res.json()) as {
    status?: string;
    output?: Record<string, unknown> | Record<string, unknown>[];
    error?: string;
  };

  if (!res.ok) {
    throw new Error(`RunPod runsync HTTP ${res.status}: ${JSON.stringify(json)}`);
  }

  if (json.status === 'COMPLETED' || json.output) {
    return extractAudio(unwrapOutput(json.output));
  }

  if (json.status === 'FAILED') {
    throw new Error(`RunPod TTS runsync failed: ${JSON.stringify(json)}`);
  }

  throw new Error('RUNSYNC_FALLBACK');
}

async function speakArabicPoll(text: string): Promise<TtsResult> {
  const submit = await fetch(RUNPOD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RUNPOD_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: omniInput(text) }),
  }).then((r) => r.json() as Promise<{ id?: string; error?: string }>);

  const jobId = submit.id;
  if (!jobId) {
    throw new Error(`RunPod TTS submit failed: ${JSON.stringify(submit)}`);
  }

  const statusUrl = RUNPOD_URL.replace(/\/run$/, `/status/${jobId}`);

  for (let i = 0; i < 60; i++) {
    const status = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${RUNPOD_KEY}` },
    }).then(
      (r) =>
        r.json() as Promise<{
          status: string;
          output?: Record<string, unknown> | Record<string, unknown>[];
        }>,
    );

    if (status.status === 'COMPLETED') {
      return extractAudio(unwrapOutput(status.output));
    }
    if (status.status === 'FAILED') {
      throw new Error(`RunPod TTS job failed: ${JSON.stringify(status)}`);
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error('RunPod TTS job timed out');
}

export async function speakArabic(text: string): Promise<TtsResult> {
  if (!RUNPOD_URL || !RUNPOD_KEY) {
    throw new TTSNotConfiguredError('OMNITTS_TTS_URL / OMNITTS_TTS_API_KEY not set');
  }

  try {
    return await speakArabicRunsync(text);
  } catch (err) {
    if (err instanceof Error && err.message === 'RUNSYNC_FALLBACK') {
      return speakArabicPoll(text);
    }
    console.warn('[RunPod TTS] runsync failed, falling back to /run poll:', err);
    return speakArabicPoll(text);
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function speakPortuguese(text: string): Promise<TtsResult> {
  if (!AZURE_KEY || !AZURE_REGION) {
    throw new TTSNotConfiguredError(
      'AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not configured — add them to .env.local to enable PT TTS',
    );
  }

  const ssml = `<speak version="1.0" xml:lang="pt-PT">
    <voice name="${AZURE_PT_VOICE}">${escapeXml(text)}</voice>
  </speak>`;

  const res = await fetch(
    `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-64kbitrate-mono-mp3',
      },
      body: ssml,
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure TTS HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: 'audio/mpeg',
  };
}

export async function speakSegment(seg: {
  lang: 'pt' | 'ar';
  text: string;
}): Promise<TtsResult> {
  return seg.lang === 'ar' ? speakArabic(seg.text) : speakPortuguese(seg.text);
}
