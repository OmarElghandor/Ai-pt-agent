import { createHash } from 'node:crypto';
import { readCachedAudio, storeCachedAudio } from '@/lib/audioCache';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';
import type { StoryDoc } from '@/lib/v2/content/story';
import { getStoryById, saveStoryDoc } from '@/lib/v2/generation/lesson/storySave';

const locks = new Map<string, Promise<{ key: string; cached: boolean }>>();

function audioKey(storyId: string, lineIndex: number, speed: 'normal' | 'slow'): string {
  return `${storyId}:L${lineIndex}:${speed}`;
}

function cacheLang(_speed: 'normal' | 'slow'): 'pt' {
  return 'pt';
}

/** Distinct cache text so slow ≠ normal in the disk cache. */
function cacheText(tl: string, speed: 'normal' | 'slow'): string {
  if (speed === 'slow') return `${tl.trim()}\0slow`;
  return tl.trim();
}

/**
 * Ensure line audio exists; write key back onto the story document.
 * One in-flight lock per storyId:lineIndex:speed.
 */
export async function ensureStoryLineAudio(opts: {
  storyId: string;
  version?: number;
  lineIndex: number;
  speed?: 'normal' | 'slow';
  /** Optional speaker id for future voice mapping. */
  speaker?: string;
}): Promise<{
  key: string;
  cached: boolean;
  buffer?: Buffer;
  contentType?: string;
  story: StoryDoc;
}> {
  const speed = opts.speed ?? 'normal';
  const lockKey = `${opts.storyId}:${opts.lineIndex}:${speed}`;

  const existing = locks.get(lockKey);
  if (existing) {
    const r = await existing;
    const story = await getStoryById(opts.storyId, opts.version);
    if (!story) throw new Error('Story not found');
    const line = story.lines[opts.lineIndex];
    const tl = line?.tl?.trim() ?? '';
    const cached = tl ? readCachedAudio(cacheLang(speed), cacheText(tl, speed)) : null;
    return {
      key: r.key,
      cached: true,
      buffer: cached?.buffer,
      contentType: cached?.contentType,
      story,
    };
  }

  const run = (async () => {
    const story = await getStoryById(opts.storyId, opts.version);
    if (!story) throw new Error('Story not found');
    const line = story.lines[opts.lineIndex];
    if (!line) throw new Error('Line not found');
    const tl = line.tl.trim();
    if (!tl) throw new Error('Empty line tl');

    const key = audioKey(story.id, opts.lineIndex, speed);
    const already = line.audio?.[speed];
    const disk = readCachedAudio(cacheLang(speed), cacheText(tl, speed));

    if (already && disk) {
      return { key: already, cached: true as const, story, buffer: disk.buffer, contentType: disk.contentType };
    }

    let buffer: Buffer;
    let contentType: string;
    if (disk) {
      buffer = disk.buffer;
      contentType = disk.contentType;
    } else {
      void opts.speaker; // reserved for per-speaker Azure voices
      try {
        // Slow: generate then we still cache under the slow text key.
        // Client may also use playbackRate; server stores a dedicated blob.
        const spoken = await speakSegment({ lang: 'pt', text: tl });
        buffer = spoken.buffer;
        contentType = spoken.contentType;
        storeCachedAudio(cacheLang(speed), cacheText(tl, speed), spoken);
      } catch (err) {
        if (err instanceof TTSNotConfiguredError) throw err;
        throw err;
      }
    }

    const lines = [...story.lines];
    const prev = lines[opts.lineIndex]!;
    // Clear stale audio if tl drifted (caller should clear on edit; belt-and-braces)
    const nextAudio = {
      ...prev.audio,
      [speed]: key,
    };
    lines[opts.lineIndex] = { ...prev, audio: nextAudio };
    const saved = await saveStoryDoc({ ...story, lines });
    return {
      key,
      cached: Boolean(already && disk),
      story: saved,
      buffer,
      contentType,
    };
  })();

  locks.set(lockKey, run.then((r) => ({ key: r.key, cached: r.cached })));
  try {
    const result = await run;
    return {
      key: result.key,
      cached: result.cached,
      buffer: result.buffer,
      contentType: result.contentType,
      story: result.story,
    };
  } finally {
    locks.delete(lockKey);
  }
}

/** When tl changes, wipe saved audio keys on that line. */
export function clearLineAudioOnTlChange(
  prev: { tl: string; audio?: { normal?: string; slow?: string } },
  nextTl: string,
): { normal?: string; slow?: string } | undefined {
  if (prev.tl.trim() === nextTl.trim()) return prev.audio;
  return undefined;
}

export function storyAudioContentHash(tl: string, speed: 'normal' | 'slow'): string {
  return createHash('sha256')
    .update(`pt\0${cacheText(tl, speed)}`)
    .digest('hex')
    .slice(0, 16);
}
