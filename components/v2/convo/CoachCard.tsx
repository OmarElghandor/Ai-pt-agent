'use client';

import type { ReactNode } from 'react';
import { isolatePtInText } from '@/lib/v2/convo/ui/isolatePt';

export type CoachCardSegment =
  | { type: 'eg'; text: string }
  | { type: 'tl'; text: string };

type Props = {
  children?: ReactNode;
  /** Structured segments (K6) — preferred over plain children string. */
  segments?: CoachCardSegment[];
  /** Optional eyebrow label (e.g. المساعد اللغوي). */
  label?: string;
  className?: string;
  /** Soft ochre correction note (screen 4) instead of default coach tip. */
  correction?: boolean;
  onPlayTl?: (tl: string) => void;
};

async function playPt(tl: string) {
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: tl, lang: 'pt-PT' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

function SegmentsBody({
  segments,
  onPlayTl,
}: {
  segments: CoachCardSegment[];
  onPlayTl?: (tl: string) => void;
}) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'tl') {
          return (
            <span key={`tl-${i}`} className="inline-flex items-baseline gap-1">
              <bdi
                dir="ltr"
                lang="pt"
                className="font-[family-name:var(--font-ft-pt)] font-bold"
              >
                {seg.text}
              </bdi>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--ft-sage)] hover:bg-[var(--ft-mist)]/50"
                aria-label="سمع البرتغالي"
                onClick={() => {
                  if (onPlayTl) onPlayTl(seg.text);
                  else void playPt(seg.text);
                }}
              >
                <span className="material-symbols-rounded text-[16px]">
                  volume_up
                </span>
              </button>
            </span>
          );
        }
        return (
          <span key={`eg-${i}`}>{isolatePtInText(seg.text)}</span>
        );
      })}
    </>
  );
}

/** Calm Kit coach / tip card — sand leading bar, warm #EFE7DC surface. */
export function CoachCard({
  children,
  segments,
  label,
  className,
  correction,
  onPlayTl,
}: Props) {
  const body =
    segments && segments.length > 0 ? (
      <SegmentsBody segments={segments} onPlayTl={onPlayTl} />
    ) : typeof children === 'string' ? (
      isolatePtInText(children)
    ) : (
      children
    );
  return (
    <aside
      className={[
        'relative self-stretch overflow-hidden rounded-[20px] px-4 py-3 shadow-[var(--ft-shadow-soft)]',
        correction
          ? 'bg-[var(--ft-surface)]'
          : 'bg-[var(--ft-coach)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        aria-hidden
        className={[
          'absolute inset-y-0 end-0 w-1 rounded-s-full',
          correction ? 'bg-[var(--ft-correction)]' : 'bg-[var(--ft-sand)]',
        ].join(' ')}
      />
      <div className="flex items-start gap-3 pe-1">
        <span
          aria-hidden
          className={[
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            correction
              ? 'bg-[color-mix(in_srgb,var(--ft-correction)_18%,transparent)] text-[var(--ft-correction-text)]'
              : 'bg-[color-mix(in_srgb,var(--ft-mist)_60%,transparent)] text-[var(--ft-sage)]',
          ].join(' ')}
        >
          <span className="material-symbols-rounded text-[20px]">
            {correction ? 'spellcheck' : 'lightbulb'}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          {label ? (
            <p
              className={[
                'mb-1 font-[family-name:var(--font-ft-ui)] text-[11px] font-medium',
                correction
                  ? 'text-[var(--ft-correction-text)]'
                  : 'text-[var(--ft-text-secondary)]',
              ].join(' ')}
            >
              {label}
            </p>
          ) : null}
          <div
            dir="rtl"
            className={[
              'text-start font-[family-name:var(--font-ft-ar)] text-sm leading-6',
              correction
                ? 'text-[var(--ft-correction-text)]'
                : 'text-[var(--ft-ink)]',
            ].join(' ')}
          >
            {body}
          </div>
        </div>
      </div>
    </aside>
  );
}
