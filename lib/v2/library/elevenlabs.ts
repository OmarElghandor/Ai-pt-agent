/**
 * Server-only ElevenLabs client for library TTS (14 §2.7, 14d LA6–LA7).
 * Injectable for tests. Never import from client components.
 */

export type ElevenLabsSettings = {
  stability?: number;
  similarity_boost?: number;
  style?: number;
};

export type TimestampsResult = {
  audio: Buffer;
  /** Character-level alignment; characters[i] aligns with starts[i]/ends[i]. */
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type ElevenLabsClient = {
  /** Generate with character timestamps. */
  textToSpeechWithTimestamps: (opts: {
    voiceId: string;
    text: string;
    modelId: string;
    outputFormat?: string;
    settings?: ElevenLabsSettings;
    /** Previous line text for prosody, if the API supports it. */
    previousText?: string;
    nextText?: string;
  }) => Promise<TimestampsResult>;
};

/** Recorded during LA6 against the live API (update when confirmed). */
export const ELEVENLABS_PREV_NEXT_TEXT_SUPPORTED: boolean | null = null;

export function isPlaceholderVoiceId(id: string | null | undefined): boolean {
  if (!id || !id.trim()) return true;
  return /<<.*>>/.test(id) || id.includes('placeholder');
}

export function settingsCacheKey(
  voiceKey: string,
  modelId: string,
  settings: ElevenLabsSettings,
): string {
  return [
    voiceKey,
    modelId,
    settings.stability ?? '',
    settings.similarity_boost ?? '',
    settings.style ?? '',
  ].join('|');
}

/** Map character timings onto token surfaces (greedy left-to-right). */
export function mapCharTimingsToTokens(
  text: string,
  tokens: { surface: string }[],
  chars: string[],
  starts: number[],
  ends: number[],
): { surface: string; start: number; end: number }[] {
  const joined = chars.join('');
  let cursor = 0;
  const out: { surface: string; start: number; end: number }[] = [];
  for (const tok of tokens) {
    const needle = tok.surface;
    let idx = joined.indexOf(needle, cursor);
    if (idx < 0) {
      // Fallback: scan ignoring spaces drift
      idx = joined.toLowerCase().indexOf(needle.toLowerCase(), cursor);
    }
    if (idx < 0 || starts.length === 0) {
      out.push({ surface: needle, start: 0, end: 0 });
      continue;
    }
    const endIdx = idx + needle.length - 1;
    out.push({
      surface: needle,
      start: starts[idx] ?? 0,
      end: ends[Math.min(endIdx, ends.length - 1)] ?? 0,
    });
    cursor = endIdx + 1;
  }
  void text;
  return out;
}

export function createElevenLabsClient(
  fetchImpl: typeof fetch = fetch,
): ElevenLabsClient {
  return {
    async textToSpeechWithTimestamps(opts) {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (!key) throw new Error('ELEVENLABS_API_KEY missing');
      const body: Record<string, unknown> = {
        text: opts.text,
        model_id: opts.modelId,
        voice_settings: {
          stability: opts.settings?.stability ?? 0.5,
          similarity_boost: opts.settings?.similarity_boost ?? 0.75,
          style: opts.settings?.style ?? 0,
        },
      };
      // previous/next text: included when env confirms support; see
      // ELEVENLABS_PREV_NEXT_TEXT_SUPPORTED in 14 §2.7 (filled in LA6).
      if (ELEVENLABS_PREV_NEXT_TEXT_SUPPORTED) {
        if (opts.previousText) body.previous_text = opts.previousText;
        if (opts.nextText) body.next_text = opts.nextText;
      }
      const format = opts.outputFormat ?? 'mp3_44100_128';
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}/with-timestamps?output_format=${encodeURIComponent(format)}`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`ElevenLabs ${res.status}: ${t.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        audio_base64: string;
        alignment?: {
          characters: string[];
          character_start_times_seconds: number[];
          character_end_times_seconds: number[];
        };
      };
      return {
        audio: Buffer.from(json.audio_base64, 'base64'),
        characters: json.alignment?.characters ?? [],
        character_start_times_seconds:
          json.alignment?.character_start_times_seconds ?? [],
        character_end_times_seconds:
          json.alignment?.character_end_times_seconds ?? [],
      };
    },
  };
}

/** In-memory stub for tests. */
export function stubElevenLabsClient(opts?: {
  failAtText?: string;
  calls?: { text: string; voiceId: string }[];
}): ElevenLabsClient {
  const calls = opts?.calls ?? [];
  return {
    async textToSpeechWithTimestamps(input) {
      calls.push({ text: input.text, voiceId: input.voiceId });
      if (opts?.failAtText && input.text === opts.failAtText) {
        throw new Error('stub failure');
      }
      const characters = [...input.text];
      return {
        audio: Buffer.from(`audio:${input.text}`),
        characters,
        character_start_times_seconds: characters.map((_, i) => i * 0.05),
        character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
      };
    },
  };
}
