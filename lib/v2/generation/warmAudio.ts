import { readCachedAudio, storeCachedAudio } from '@/lib/audioCache';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';
import type { LessonPack } from '@/lib/v2/content/lesson';

export type WarmAudioResult = {
  cached: number;
  skipped: number;
  failed: number;
};

type Segment = { lang: 'pt' | 'ar'; text: string };

function collectSegments(pack: LessonPack): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();

  const add = (lang: 'pt' | 'ar', text: string | undefined) => {
    const t = text?.trim();
    if (!t) return;
    const key = `${lang}\0${t}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ lang, text: t });
  };

  for (const item of pack.items) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as {
      tl?: string;
      tl_f?: string;
      say?: string;
      type?: string;
    };
    add('pt', rec.tl);
    add('pt', rec.tl_f);
    // Pronunciation in Arabic letters — use AR TTS path
    add('ar', rec.say);
  }

  return out;
}

/**
 * Warm the existing TTS disk cache for all speakable strings in a lesson pack.
 */
export async function warmLessonPackAudio(
  pack: LessonPack,
): Promise<WarmAudioResult> {
  let cached = 0;
  let skipped = 0;
  let failed = 0;

  for (const seg of collectSegments(pack)) {
    if (readCachedAudio(seg.lang, seg.text)) {
      skipped += 1;
      continue;
    }
    try {
      const result = await speakSegment({ lang: seg.lang, text: seg.text });
      storeCachedAudio(seg.lang, seg.text, result);
      cached += 1;
    } catch (err) {
      failed += 1;
      if (!(err instanceof TTSNotConfiguredError)) {
        console.warn('[v2-warm-audio]', seg.lang, seg.text.slice(0, 40), err);
      }
    }
  }

  return { cached, skipped, failed };
}
