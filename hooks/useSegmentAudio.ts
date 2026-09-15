'use client';

import { useCallback, useRef, useState } from 'react';
import {
  segmentTtsText,
  type Segment,
} from '@/lib/parseTaggedMessage';

let warnedPtSkip = false;

const audioCache = new Map<string, Promise<Blob | null>>();

function cacheKey(seg: Segment): string {
  return `${seg.lang}:${segmentTtsText(seg)}`;
}

async function fetchSegmentAudio(seg: Segment): Promise<Blob | null> {
  const key = cacheKey(seg);
  const cached = audioCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: seg.lang, text: segmentTtsText(seg) }),
    });

    if (res.status === 503) {
      const data = (await res.json()) as { code?: string };
      if (data.code === 'TTS_NOT_CONFIGURED' && seg.lang === 'pt') {
        if (!warnedPtSkip) {
          console.warn(
            '[TTS] Portuguese Azure Speech not configured — skipping PT segments',
          );
          warnedPtSkip = true;
        }
        return null;
      }
    }

    if (!res.ok) {
      const err = await res.text();
      console.error('[TTS] segment failed:', seg.lang, err);
      return null;
    }

    return res.blob();
  })();

  audioCache.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    audioCache.delete(key);
    throw err;
  }
}

/** Kick off TTS for every segment now; PT is ready by the time earlier AR finishes. */
function prefetchAll(segments: Segment[]): Promise<Blob | null>[] {
  return segments.map((seg) => {
    const key = cacheKey(seg);
    if (!audioCache.has(key)) {
      console.log(
        '[TTS] prefetch',
        seg.lang,
        segmentTtsText(seg).slice(0, 40),
      );
    }
    return fetchSegmentAudio(seg);
  });
}

function playBlob(
  blob: Blob,
  audioElRef: { current: HTMLAudioElement | null },
  shouldAbort: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (shouldAbort()) {
      resolve();
      return;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioElRef.current = audio;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (audioElRef.current === audio) audioElRef.current = null;
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    audio.onended = finish;
    audio.onpause = () => {
      if (shouldAbort()) finish();
    };
    audio.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Audio playback failed'));
    };
    void audio.play().catch((err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (shouldAbort()) resolve();
      else reject(err);
    });
  });
}

export function useSegmentAudio() {
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeSegments, setActiveSegments] = useState<Segment[]>([]);
  const abortRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    abortRef.current = true;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = '';
      audioElRef.current = null;
    }
    setPlaying(false);
    setActiveIndex(null);
    setActiveSegments([]);
  }, []);

  const playSegments = useCallback(async (segments: Segment[]) => {
    abortRef.current = false;
    const playable = segments.filter((s) => s.text.trim().length > 0);
    setActiveSegments(playable);
    setPlaying(true);

    // Prefetch ALL segments in parallel as soon as the LLM reply is ready.
    // Arabic usually plays first; Portuguese generates in the background
    // so it's ready when its turn comes — same sentence order, less gap.
    const ready = prefetchAll(playable);

    try {
      for (let i = 0; i < playable.length; i++) {
        if (abortRef.current) break;
        setActiveIndex(i);
        const blob = await ready[i];
        if (abortRef.current) break;
        if (blob) {
          await playBlob(blob, audioElRef, () => abortRef.current);
        }
      }
    } catch (err) {
      if (!abortRef.current) console.error('[useSegmentAudio]', err);
    } finally {
      setPlaying(false);
      setActiveIndex(null);
      setActiveSegments([]);
    }
  }, []);

  return {
    playing,
    activeIndex,
    activeSegments,
    playSegments,
    stop,
  };
}
