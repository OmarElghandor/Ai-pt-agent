'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TalkBubble } from './types';
import {
  coachStripDelayMs,
  paceDelayMs,
  prefersReducedMotion,
} from './paceDelay';

export type PaceScale = number;

type QueueItem =
  | { kind: 'show'; bubble: TalkBubble }
  | { kind: 'coach_strip'; bubbleId: string };

function sleep(ms: number, signal: { cancelled: boolean }) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const t = setTimeout(() => {
      clearInterval(poll);
      resolve();
    }, ms);
    const poll = setInterval(() => {
      if (signal.cancelled) {
        clearTimeout(t);
        clearInterval(poll);
        resolve();
      }
    }, 40);
  });
}

/**
 * Client-only paced reveal for character/coach bubbles.
 * Authoritative list is reduced immediately; this queue reveals one by one.
 * scale 0 → no delays (tests/harness).
 */
export function usePacedBubbles(opts?: { scale?: PaceScale }) {
  const scaleRef = useRef<PaceScale>(opts?.scale ?? 1);
  useEffect(() => {
    if (opts?.scale != null) scaleRef.current = opts.scale;
  }, [opts?.scale]);

  const [visible, setVisible] = useState<TalkBubble[]>([]);
  const visibleRef = useRef<TalkBubble[]>([]);
  const [typing, setTyping] = useState(false);

  const queueRef = useRef<QueueItem[]>([]);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);
  const cancelRef = useRef({ cancelled: false });
  const typingIdRef = useRef<string | null>(null);

  const commitVisible = useCallback((next: TalkBubble[]) => {
    visibleRef.current = next;
    setVisible(next);
  }, []);

  const clearTyping = useCallback(() => {
    const tid = typingIdRef.current;
    typingIdRef.current = null;
    setTyping(false);
    if (!tid) return;
    commitVisible(visibleRef.current.filter((b) => b.id !== tid));
  }, [commitVisible]);

  const revealBubble = useCallback(
    (bubble: TalkBubble) => {
      clearTyping();
      const withCoach =
        bubble.role === 'character' && bubble.coachEg
          ? { ...bubble, coachRevealed: false }
          : bubble;
      const exists = visibleRef.current.some((b) => b.id === withCoach.id);
      if (exists) {
        commitVisible(
          visibleRef.current.map((b) =>
            b.id === withCoach.id ? { ...b, ...withCoach, typing: false } : b,
          ),
        );
      } else {
        commitVisible([...visibleRef.current, { ...withCoach, typing: false }]);
      }
    },
    [clearTyping, commitVisible],
  );

  const revealCoachStrip = useCallback(
    (bubbleId: string) => {
      commitVisible(
        visibleRef.current.map((b) =>
          b.id === bubbleId && b.role === 'character'
            ? { ...b, coachRevealed: true }
            : b,
        ),
      );
    },
    [commitVisible],
  );

  const flush = useCallback(() => {
    cancelRef.current.cancelled = true;
    cancelRef.current = { cancelled: false };
    const pending = queueRef.current;
    queueRef.current = [];
    runningRef.current = false;
    clearTyping();
    for (const item of pending) {
      if (item.kind === 'show') {
        const b =
          item.bubble.role === 'character' && item.bubble.coachEg
            ? { ...item.bubble, coachRevealed: true, typing: false }
            : { ...item.bubble, typing: false };
        knownIdsRef.current.add(b.id);
        const exists = visibleRef.current.some((x) => x.id === b.id);
        if (exists) {
          commitVisible(
            visibleRef.current.map((x) => (x.id === b.id ? { ...x, ...b } : x)),
          );
        } else {
          commitVisible([...visibleRef.current, b]);
        }
      } else {
        revealCoachStrip(item.bubbleId);
      }
    }
    // Ensure any character with coachEg is revealed.
    commitVisible(
      visibleRef.current.map((b) =>
        b.role === 'character' && b.coachEg
          ? { ...b, coachRevealed: true, typing: false }
          : b,
      ),
    );
  }, [clearTyping, commitVisible, revealCoachStrip]);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const signal = cancelRef.current;
    while (queueRef.current.length > 0 && !signal.cancelled) {
      const item = queueRef.current.shift()!;
      if (item.kind === 'coach_strip') {
        const delay = coachStripDelayMs({
          scale: scaleRef.current,
          reducedMotion: prefersReducedMotion(),
        });
        await sleep(delay, signal);
        if (signal.cancelled) {
          queueRef.current.unshift(item);
          break;
        }
        revealCoachStrip(item.bubbleId);
        continue;
      }

      const bubble = item.bubble;
      // Streaming character: show typing until first token already arrived.
      const isStreaming =
        bubble.role === 'character' && Boolean(bubble.streaming);

      if (bubble.role === 'character' && !isStreaming) {
        const tid = `typing-${bubble.id}`;
        typingIdRef.current = tid;
        setTyping(true);
        commitVisible([
          ...visibleRef.current.filter((b) => !b.typing),
          {
            id: tid,
            role: 'character',
            tl: '',
            typing: true,
            streaming: true,
          },
        ]);
        const delay = paceDelayMs({
          charCount: bubble.tl.length,
          scale: scaleRef.current,
          reducedMotion: prefersReducedMotion(),
        });
        await sleep(delay, signal);
        if (signal.cancelled) {
          queueRef.current.unshift(item);
          break;
        }
      } else if (bubble.role === 'character' && isStreaming) {
        // Typing until first token — if tl already has text, reveal immediately.
        if (!bubble.tl.trim()) {
          const tid = `typing-${bubble.id}`;
          typingIdRef.current = tid;
          setTyping(true);
          commitVisible([
            ...visibleRef.current.filter((b) => !b.typing),
            {
              id: tid,
              role: 'character',
              tl: '',
              typing: true,
              streaming: true,
            },
          ]);
          // Wait briefly; stream updates will replace via syncPatch.
          await sleep(
            paceDelayMs({
              charCount: 0,
              scale: scaleRef.current,
              reducedMotion: prefersReducedMotion(),
            }),
            signal,
          );
          if (signal.cancelled) {
            queueRef.current.unshift(item);
            break;
          }
        }
      } else if (bubble.role === 'coach') {
        const delay = paceDelayMs({
          charCount: bubble.eg.length,
          scale: scaleRef.current,
          reducedMotion: prefersReducedMotion(),
        });
        await sleep(delay, signal);
        if (signal.cancelled) {
          queueRef.current.unshift(item);
          break;
        }
      }

      revealBubble(bubble);
      if (
        bubble.role === 'character' &&
        bubble.coachEg &&
        !signal.cancelled
      ) {
        queueRef.current.unshift({ kind: 'coach_strip', bubbleId: bubble.id });
      }
    }
    runningRef.current = false;
  }, [commitVisible, revealBubble, revealCoachStrip]);

  /** Replace/merge learner + correction + in-flight stream patches immediately. */
  const syncAuthoritative = useCallback(
    (full: TalkBubble[]) => {
      // Learner bubbles + corrections always mirror authoritative.
      const learners = full.filter((b) => b.role === 'learner');
      const learnerIds = new Set(learners.map((b) => b.id));

      // Patch existing visible character streams in place.
      let nextVisible = visibleRef.current.map((v) => {
        if (v.role === 'learner' && learnerIds.has(v.id)) {
          return learners.find((l) => l.id === v.id) ?? v;
        }
        if (v.role === 'character' && !v.typing) {
          const auth = full.find((b) => b.id === v.id && b.role === 'character');
          if (auth && auth.role === 'character') {
            return {
              ...v,
              ...auth,
              coachRevealed: v.coachRevealed || auth.coachRevealed,
              typing: false,
            };
          }
        }
        return v;
      });

      // Add any new learner bubbles not yet visible.
      for (const l of learners) {
        if (!nextVisible.some((b) => b.id === l.id)) {
          nextVisible = [...nextVisible, l];
        }
      }

      // Enqueue new character/coach bubbles (final or streaming shell).
      for (const b of full) {
        if (b.role !== 'character' && b.role !== 'coach') continue;
        if (knownIdsRef.current.has(b.id)) {
          // Already queued or shown — stream patches handled above.
          continue;
        }
        knownIdsRef.current.add(b.id);
        queueRef.current.push({ kind: 'show', bubble: b });
      }

      commitVisible(nextVisible);
      void pump();
    },
    [commitVisible, pump],
  );

  const reset = useCallback((initial: TalkBubble[] = []) => {
    cancelRef.current.cancelled = true;
    cancelRef.current = { cancelled: false };
    queueRef.current = [];
    runningRef.current = false;
    knownIdsRef.current = new Set(initial.map((b) => b.id));
    typingIdRef.current = null;
    setTyping(false);
    // Opening bubbles: reveal immediately (no pace on session start).
    commitVisible(
      initial.map((b) =>
        b.role === 'character' && b.coachEg
          ? { ...b, coachRevealed: true }
          : b,
      ),
    );
  }, [commitVisible]);

  return {
    visible,
    typing,
    syncAuthoritative,
    flush,
    reset,
    /** Direct commit (e.g. adding learner before turn). Flushes pace first. */
    commitImmediate: (next: TalkBubble[]) => {
      flush();
      knownIdsRef.current = new Set(next.map((b) => b.id));
      commitVisible(next);
    },
  };
}
