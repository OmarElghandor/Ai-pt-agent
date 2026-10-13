import { readCachedAudio, storeCachedAudio } from '@/lib/audioCache';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';
import type { AuthoredSegment } from './types';

export async function warmAuthoredSegments(
  segments: AuthoredSegment[],
): Promise<{ cached: number; skipped: number; failed: number }> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  const seen = new Set<string>();
  for (const seg of segments) {
    const lang = seg.lang;
    const text = (seg.lang === 'ar' ? seg.pronunciation : seg.text).trim();
    if (!text) {
      skipped += 1;
      continue;
    }
    const key = `${lang}\0${text}`;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    if (readCachedAudio(lang, text)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await speakSegment({ lang, text });
      storeCachedAudio(lang, text, result);
      cached += 1;
    } catch (err) {
      failed += 1;
      if (!(err instanceof TTSNotConfiguredError)) {
        console.warn('[warm-lesson-audio]', lang, text.slice(0, 40), err);
      }
    }
  }

  return { cached, skipped, failed };
}
