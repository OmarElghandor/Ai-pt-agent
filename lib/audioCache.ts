import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseTaggedMessage, segmentTtsText } from './parseTaggedMessage';
import { speakSegment, TTSNotConfiguredError } from './tts';

const dir = path.join(process.cwd(), 'data', 'opener-audio');

function fileBase(lang: string, text: string): string {
  const hash = createHash('sha256').update(`${lang}\0${text}`).digest('hex');
  return path.join(dir, hash);
}

export function readCachedAudio(
  lang: string,
  text: string,
): { buffer: Buffer; contentType: string } | null {
  const base = fileBase(lang, text.trim());
  if (!existsSync(`${base}.bin`) || !existsSync(`${base}.type`)) return null;
  return {
    buffer: readFileSync(`${base}.bin`),
    contentType: readFileSync(`${base}.type`, 'utf8'),
  };
}

export function storeCachedAudio(
  lang: string,
  text: string,
  result: { buffer: Buffer; contentType: string },
): void {
  mkdirSync(dir, { recursive: true });
  const base = fileBase(lang, text.trim());
  writeFileSync(`${base}.bin`, result.buffer);
  writeFileSync(`${base}.type`, result.contentType);
}

/** Generate opener audio once. Failures stay quiet so the reply still appears. */
export async function warmTaggedAudio(tagged: string): Promise<void> {
  const segments = parseTaggedMessage(tagged).filter((seg) => seg.text.trim() && !seg.pending);
  await Promise.all(
    segments.map(async (seg) => {
      const text = segmentTtsText(seg);
      if (!text || readCachedAudio(seg.lang, text)) return;
      try {
        const result = await speakSegment({ lang: seg.lang, text });
        storeCachedAudio(seg.lang, text, result);
      } catch (err) {
        if (!(err instanceof TTSNotConfiguredError)) {
          console.warn('[opener-audio]', err);
        }
      }
    }),
  );
}
