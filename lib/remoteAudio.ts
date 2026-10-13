import { createHash } from 'node:crypto';
import { liveLessons } from '@/lib/lessons/catalogue';

/** Lookup Cloudinary (or other) URL warmed by langify for a pack segment. */
export function findRemoteAudioUrl(lang: 'pt' | 'ar', text: string): string | null {
  const needle = text.trim();
  if (!needle) return null;
  const hash = createHash('sha256').update(`${lang}\0${needle}`).digest('hex').slice(0, 16);
  for (const pack of liveLessons()) {
    for (const ref of pack.audioCacheRefs ?? []) {
      if (!ref.url) continue;
      const language = (ref.language || '').toLowerCase();
      if (language && language !== lang && language !== (lang === 'ar' ? 'arz' : 'pt')) {
        continue;
      }
      if (ref.key === needle || ref.key === `${lang}:${needle}` || ref.key.includes(hash)) {
        return ref.url;
      }
      // Key may be the raw text
      if (ref.key.endsWith(needle) || ref.key.includes(needle)) {
        return ref.url;
      }
    }
  }
  return null;
}
