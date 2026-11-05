'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';

export type BubbleTone = 'warm' | 'calm';

type Props = {
  tl: string;
  say?: string;
  streaming?: boolean;
  /** Egyptian / MSA meaning — revealed via معناها؟ */
  meaningEg?: string;
  /** Auto-play TTS when the line finishes streaming (Batch 10 D9). */
  autoPlay?: boolean;
  /** Playback rate (Mais devagar). */
  playbackRate?: number;
  onPlayStart?: () => void;
  onPlayEnd?: () => void;
  /** Free talk Calm Kit vs Warm Editorial (Learn). Default warm. */
  tone?: BubbleTone;
  /** Partner display name for calm header. */
  partnerName?: string;
};

export function CharacterBubble({
  tl,
  say,
  streaming,
  meaningEg,
  autoPlay,
  playbackRate = 1,
  onPlayStart,
  onPlayEnd,
  tone = 'warm',
  partnerName = 'Inês',
}: Props) {
  const [showMeaning, setShowMeaning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playedRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!autoPlay || streaming || !tl.trim()) return;
    if (playedRef.current === tl) return;
    playedRef.current = tl;
    let cancelled = false;
    (async () => {
      try {
        onPlayStart?.();
        setPlaying(true);
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: tl, lang: 'pt' }),
        });
        if (!res.ok || cancelled) {
          setPlaying(false);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.playbackRate = playbackRate;
        audioRef.current = audio;
        audio.onended = () => {
          URL.revokeObjectURL(url);
          setPlaying(false);
          onPlayEnd?.();
        };
        await audio.play();
      } catch {
        setPlaying(false);
        onPlayEnd?.();
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, [autoPlay, streaming, tl, playbackRate, onPlayStart, onPlayEnd]);

  if (tone === 'calm') {
    return (
      <div className="flex max-w-[92%] flex-col items-start gap-1.5 self-start">
        <div className="relative w-full rounded-[20px] rounded-ss-md bg-[var(--ft-surface)] px-3.5 py-3 shadow-[var(--ft-shadow-soft)] ring-1 ring-[var(--ft-border)]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ft-sage-dark)] ring-2 ring-[var(--ft-moss)]"
              >
                <span className="material-symbols-rounded text-[18px] text-white">
                  person
                </span>
              </span>
              <div>
                <p className="font-[family-name:var(--font-ft-ui)] text-[12px] font-semibold text-[var(--ft-ink)]">
                  {partnerName}
                </p>
                <p className="font-[family-name:var(--font-ft-ar)] text-[10px] text-[var(--ft-text-secondary)]">
                  {streaming || playing ? 'تتحدث الآن' : 'البرتغال'}
                </p>
              </div>
            </div>
            {(streaming || playing) && tl.trim() ? (
              <div
                className="flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--ft-mist)_30%,transparent)] px-2.5 py-1"
                aria-hidden
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="ft-wave-bar h-3"
                    style={{
                      animationDelay: `${i * 0.12}s`,
                      height: `${10 + (i % 3) * 4}px`,
                      background:
                        i % 2 === 0
                          ? 'var(--ft-sage)'
                          : 'var(--ft-moss)',
                    }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <p
            dir="ltr"
            lang="pt"
            className="text-start font-[family-name:var(--font-ft-pt)] text-[16px] font-semibold leading-snug tracking-tight text-[var(--ft-ink)]"
          >
            {tl}
            {streaming ? (
              <span className="ms-0.5 inline-block h-3 w-1 animate-pulse rounded-sm bg-[var(--ft-sage)] align-middle" />
            ) : null}
          </p>

          {say ? (
            <p
              dir="rtl"
              className="mt-2 rounded-xl bg-[color-mix(in_srgb,var(--ft-ivory)_70%,transparent)] px-2.5 py-1.5 text-end font-[family-name:var(--font-ft-ar)] text-[12px] leading-5 text-[var(--ft-text-secondary)]"
            >
              {say}
            </p>
          ) : null}

          {showMeaning && meaningEg ? (
            <p
              dir="rtl"
              className="mt-2 border-t border-[var(--ft-border)] pt-2 text-end font-[family-name:var(--font-ft-ar)] text-[13px] text-[var(--ft-ink)]"
            >
              {meaningEg}
            </p>
          ) : null}

          <div className="mt-2.5 flex items-center justify-between gap-2">
            {tl.trim() ? (
              <AudioButton text={tl} lang="pt" size="chip" label="استمع" />
            ) : (
              <span />
            )}
            {meaningEg ? (
              <button
                type="button"
                onClick={() => setShowMeaning((v) => !v)}
                className="font-[family-name:var(--font-ft-ar)] text-[12px] font-semibold text-[var(--ft-sage)] underline decoration-[var(--ft-sand)] underline-offset-4"
              >
                {showMeaning ? 'إخفاء المعنى' : 'معناها؟'}
              </button>
            ) : (
              <span
                className="font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-text-secondary)]/50"
                title="المعنى هيتضاف لاحقاً"
              >
                معناها؟
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[85%] flex-col items-start gap-1 self-start">
      <div className="relative rounded-2xl rounded-br-md border border-white/80 bg-white/95 px-3.5 py-2.5 shadow-[var(--shadow-v2-soft)] ring-1 ring-v2-primary/10">
        <p
          dir="ltr"
          lang="pt"
          className="text-start font-[family-name:var(--font-v2-target)] text-[15px] font-semibold leading-snug tracking-tight text-v2-primary"
        >
          {tl}
          {streaming ? (
            <span className="ms-0.5 inline-block h-3 w-1 animate-pulse rounded-sm bg-v2-action align-middle" />
          ) : null}
        </p>
        {say ? (
          <p
            dir="rtl"
            className="mt-1 text-end font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted"
          >
            {say}
          </p>
        ) : null}
        {showMeaning && meaningEg ? (
          <p
            dir="rtl"
            className="mt-1 border-t border-v2-line/50 pt-1 text-end font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink"
          >
            {meaningEg}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {tl.trim() ? (
            <AudioButton text={tl} lang="pt" size="chip" label="اسمع" />
          ) : (
            <span />
          )}
          {meaningEg ? (
            <button
              type="button"
              onClick={() => setShowMeaning((v) => !v)}
              className="font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-primary/80 underline-offset-2 hover:underline"
            >
              {showMeaning ? 'إخفاء المعنى' : 'معناها؟'}
            </button>
          ) : (
            <span
              className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted/50"
              title="المعنى هيتضاف لاحقاً"
            >
              معناها؟
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
