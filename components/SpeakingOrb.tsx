'use client';

import type { Segment } from '@/lib/parseTaggedMessage';

export type OrbMode = 'idle' | 'listening' | 'transcribing' | 'speaking';

const STATUS: Record<OrbMode, string> = {
  idle: 'اضغط المايك وكلم…',
  listening: 'بيسمعك…',
  transcribing: 'بيحوّل لصوت…',
  speaking: 'بيتكلم دلوقتي…',
};

type Props = {
  mode?: OrbMode;
  segments?: Segment[];
  activeIndex?: number | null;
  transcript?: string;
  error?: string | null;
  caption?: Segment[];
  idleLabel?: string | null;
};

export function SpeakingOrb({
  mode = 'idle',
  segments = [],
  activeIndex = null,
  transcript,
  error,
  caption = [],
  idleLabel = null,
}: Props) {
  const pulse = mode === 'listening' || mode === 'speaking';
  const status = mode === 'idle' && idleLabel ? idleLabel : STATUS[mode];

  return (
    <div className="flex flex-col items-center gap-5 px-4 py-6">
      <div
        className={`relative flex h-44 w-44 items-center justify-center rounded-full avatar-gradient ${
          pulse ? 'orb-pulse' : ''
        }`}
      >
        <div className="absolute inset-[10%] overflow-hidden rounded-full bg-[#04100e]">
          <svg
            className={`absolute inset-0 h-full w-full opacity-80 ${
              pulse ? 'orb-wave' : ''
            }`}
            viewBox="0 0 200 200"
            preserveAspectRatio="none"
            aria-hidden={true}
          >
            <defs>
              <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3DE0B5" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#17B9A0" stopOpacity="0.5" />
              </linearGradient>
            </defs>
            <path
              d="M0,110 C40,80 60,140 100,110 C140,80 160,140 200,110 L200,200 L0,200 Z"
              fill="url(#waveGrad)"
              opacity="0.7"
            />
            <path
              d="M0,130 C50,100 70,150 110,125 C150,100 170,145 200,130 L200,200 L0,200 Z"
              fill="#3DE0B5"
              opacity="0.35"
            />
          </svg>
        </div>
      </div>

      <p className="text-sm text-muted">{status}</p>

      {error && (
        <p className="max-w-sm text-center text-sm text-red-300">{error}</p>
      )}

      {mode === 'speaking' && segments.length > 0 ? (
        <p
          dir="rtl"
          lang="ar"
          className="max-w-sm text-center text-base leading-relaxed"
        >
          {segments.map((seg, i) => {
            const active = activeIndex === i;
            const gap = i > 0 && segments[i - 1].lang !== seg.lang ? ' ' : '';
            const cls = active
              ? 'font-semibold text-white'
              : 'font-light text-muted';
            if (seg.lang === 'pt') {
              return (
                <span
                  key={i}
                  className={
                    active
                      ? 'font-semibold text-accent-mint'
                      : 'font-light text-accent-mint/70'
                  }
                  style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
                  lang="pt"
                >
                  {gap}
                  {seg.text}
                </span>
              );
            }
            return (
              <span key={i} className={cls}>
                {gap}
                {seg.text}
              </span>
            );
          })}
        </p>
      ) : caption.length > 0 ? (
        <p dir="rtl" lang="ar" className="max-w-sm text-center text-base leading-relaxed">
          {caption.map((seg, i) => {
            const gap = i > 0 && caption[i - 1].lang !== seg.lang ? ' ' : '';
            if (seg.lang === 'pt') {
              return (
                <span
                  key={i}
                  className="text-accent-mint"
                  style={{ unicodeBidi: 'isolate', direction: 'ltr' }}
                  lang="pt"
                >
                  {gap}
                  {seg.text}
                </span>
              );
            }
            return (
              <span key={i}>
                {gap}
                {seg.text}
              </span>
            );
          })}
        </p>
      ) : transcript ? (
        <p
          dir="auto"
          className="max-w-sm text-center text-base font-medium leading-relaxed text-white"
        >
          {transcript}
        </p>
      ) : null}
    </div>
  );
}
