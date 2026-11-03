import { createHash } from 'node:crypto';
import { readCachedAudio, storeCachedAudio } from '@/lib/audioCache';
import { speakSegment, TTSNotConfiguredError } from '@/lib/tts';
import {
  DEFAULT_PT_VOICE,
  voiceForCharacter,
} from '@/lib/v2/characters/registry';
import type { StoryDoc } from '@/lib/v2/content/story';
import { getStoryById, saveStoryDoc } from '@/lib/v2/generation/lesson/storySave';

const locks = new Map<string, Promise<{ key: string; cached: boolean }>>();

function audioKey(
  storyId: string,
  lineIndex: number,
  speed: 'normal' | 'slow',
  voice: string,
): string {
  return `${storyId}:L${lineIndex}:${speed}:${voice}`;
}

function cacheLang(_speed: 'normal' | 'slow'): 'pt' {
  return 'pt';
}

/** Distinct cache text so slow ≠ normal and voice changes bust the cache. */
function cacheText(tl: string, speed: 'normal' | 'slow', voice: string): string {
  const base = speed === 'slow' ? `${tl.trim()}\0slow` : tl.trim();
  return `${base}\0voice:${voice}`;
}

function resolveVoice(story: StoryDoc, speaker?: string): string {
  const sp = (speaker ?? '').trim().toLowerCase();
  if (!sp) return DEFAULT_PT_VOICE;
  if (sp === 'narrator') return voiceForCharacter('narrator');
  const fromCast = story.cast?.find(
    (c) =>
      c.id.toLowerCase() === sp ||
      (sp === 'learner' && c.role === 'learner'),
  );
  if (fromCast?.voice) return fromCast.voice;
  if (fromCast?.id) return voiceForCharacter(fromCast.id);
  if (sp === 'learner') return voiceForCharacter('yassin');
  return voiceForCharacter(sp);
}

/**
 * Ensure line audio exists; write key back onto the story document.
 * One in-flight lock per storyId:lineIndex:speed:voice.
 */
export async function ensureStoryLineAudio(opts: {
  storyId: string;
  version?: number;
  lineIndex: number;
  speed?: 'normal' | 'slow';
  /** Speaker id for Azure voice mapping. */
  speaker?: string;
}): Promise<{
  key: string;
  cached: boolean;
  buffer?: Buffer;
  contentType?: string;
  story: StoryDoc;
}> {
  const speed = opts.speed ?? 'normal';

  const storyForVoice = await getStoryById(opts.storyId, opts.version);
  if (!storyForVoice) throw new Error('Story not found');
  const line0 = storyForVoice.lines[opts.lineIndex];
  const speaker = opts.speaker ?? line0?.speaker;
  const voice = resolveVoice(storyForVoice, speaker);
  const lockKey = `${opts.storyId}:${opts.lineIndex}:${speed}:${voice}`;

  const existing = locks.get(lockKey);
  if (existing) {
    const r = await existing;
    const story = await getStoryById(opts.storyId, opts.version);
    if (!story) throw new Error('Story not found');
    const line = story.lines[opts.lineIndex];
    const tl = line?.tl?.trim() ?? '';
    const cached = tl
      ? readCachedAudio(cacheLang(speed), cacheText(tl, speed, voice))
      : null;
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

    const key = audioKey(story.id, opts.lineIndex, speed, voice);
    const already = line.audio?.[speed];
    const disk = readCachedAudio(cacheLang(speed), cacheText(tl, speed, voice));

    if (already && disk) {
      return {
        key: already,
        cached: true as const,
        story,
        buffer: disk.buffer,
        contentType: disk.contentType,
      };
    }

    let buffer: Buffer;
    let contentType: string;
    if (disk) {
      buffer = disk.buffer;
      contentType = disk.contentType;
    } else {
      try {
        const spoken = await speakSegment({ lang: 'pt', text: tl, voice });
        buffer = spoken.buffer;
        contentType = spoken.contentType;
        storeCachedAudio(cacheLang(speed), cacheText(tl, speed, voice), spoken);
      } catch (err) {
        if (err instanceof TTSNotConfiguredError) throw err;
        throw err;
      }
    }

    const lines = [...story.lines];
    const prev = lines[opts.lineIndex]!;
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

export function storyAudioContentHash(
  tl: string,
  speed: 'normal' | 'slow',
  voice = DEFAULT_PT_VOICE,
): string {
  return createHash('sha256')
    .update(`pt\0${cacheText(tl, speed, voice)}`)
    .digest('hex')
    .slice(0, 16);
}
