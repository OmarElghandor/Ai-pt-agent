'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Step } from '@/lib/v2/content/page';
import type { Rt } from '@/lib/v2/content/rt';
import { allTargets, targetsBefore } from '@/lib/v2/render/guided';
import { plainRt } from '@/lib/v2/render/speechTarget';
import {
  ASK_CORRECT_HOLD_MS,
  afterRevealGapMs,
  bumpToken,
  isTokenCurrent,
  readMsForTip,
  type PlaybackToken,
} from '@/lib/v2/render/timing';

type Args = {
  enabled: boolean;
  steps: Step[];
  speed: number;
  playTip: (text: string, signal: AbortSignal) => Promise<void>;
  playTarget: (target: string, signal: AbortSignal) => Promise<void>;
  onAnswered?: (stepIndex: number, optionIndex: number) => void;
};

export function useGuidedPlayback({
  enabled,
  steps,
  speed,
  playTip,
  playTarget,
  onAnswered,
}: Args) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [phase, setPhase] = useState<'idle' | 'reading' | 'ask' | 'why' | 'done'>('idle');
  const [hint, setHint] = useState<Rt | null>(null);
  const [why, setWhy] = useState<Rt | null>(null);
  const [shake, setShake] = useState(0);

  const token = useRef<PlaybackToken>({ current: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const stepsRef = useRef(steps);
  const speedRef = useRef(speed);
  const playTipRef = useRef(playTip);
  const playTargetRef = useRef(playTarget);
  const onAnsweredRef = useRef(onAnswered);
  stepsRef.current = steps;
  speedRef.current = speed;
  playTipRef.current = playTip;
  playTargetRef.current = playTarget;
  onAnsweredRef.current = onAnswered;

  const cancel = () => {
    bumpToken(token.current);
    abortRef.current?.abort();
    abortRef.current = null;
  };

  useEffect(() => {
    if (!enabled || !playing) return;
    const stepsNow = stepsRef.current;
    if (index >= stepsNow.length) {
      setPhase('done');
      setPlaying(false);
      return;
    }
    const step = stepsNow[index]!;
    if (step.kind === 'ask') {
      setPhase('ask');
      return;
    }

    setPhase('reading');
    const snapshot = token.current.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const alive = () => isTokenCurrent(token.current, snapshot) && !ctrl.signal.aborted;

    void (async () => {
      const wait = readMsForTip(step.tip, speedRef.current);
      const tipText = plainRt(step.tip);
      await Promise.all([
        tipText ? playTipRef.current(tipText, ctrl.signal) : Promise.resolve(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, wait);
        }),
      ]);
      if (!alive()) return;
      setRevealed((prev) => (prev.includes(step.target) ? prev : [...prev, step.target]));
      await playTargetRef.current(step.target, ctrl.signal);
      if (!alive()) return;
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, afterRevealGapMs(speedRef.current));
      });
      if (!alive()) return;
      setIndex((current) => current + 1);
    })();

    return () => {
      bumpToken(token.current);
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [enabled, playing, index, speed]);

  const revealedSet = useMemo(() => new Set(revealed), [revealed]);
  const activeTarget =
    !enabled || phase === 'done' || index >= steps.length ? null : (steps[index]?.target ?? null);

  function play() {
    if (!enabled || index >= stepsRef.current.length) return;
    setPlaying(true);
  }

  function pause() {
    cancel();
    setPlaying(false);
  }

  function showAll() {
    cancel();
    setRevealed(allTargets(stepsRef.current));
    setIndex(stepsRef.current.length);
    setPlaying(false);
    setPhase('done');
    setHint(null);
    setWhy(null);
  }

  function jumpTo(start: number) {
    cancel();
    setRevealed(targetsBefore(stepsRef.current, start));
    setHint(null);
    setWhy(null);
    setIndex(start);
    setPhase('reading');
    setPlaying(true);
  }

  function answer(optionIndex: number) {
    const step = stepsRef.current[index];
    if (!step || step.kind !== 'ask' || phase !== 'ask') return;
    const option = step.ask.options[optionIndex];
    if (!option) return;
    onAnsweredRef.current?.(index, optionIndex);
    if (!option.correct) {
      setHint(step.ask.hint ?? null);
      setWhy(null);
      setShake((n) => n + 1);
      return;
    }
    setHint(null);
    setWhy(step.ask.why ?? null);
    setPhase('why');
    const snapshot = token.current.current;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    window.setTimeout(() => {
      if (!isTokenCurrent(token.current, snapshot)) return;
      setRevealed((prev) => (prev.includes(step.target) ? prev : [...prev, step.target]));
      void (async () => {
        await playTargetRef.current(step.target, ctrl.signal);
        if (!isTokenCurrent(token.current, snapshot) || ctrl.signal.aborted) return;
        setWhy(null);
        setIndex((current) => current + 1);
      })();
    }, ASK_CORRECT_HOLD_MS);
  }

  return {
    index,
    playing,
    phase,
    revealedSet,
    activeTarget,
    hint,
    why,
    shake,
    play,
    pause,
    showAll,
    jumpTo,
    answer,
  };
}
