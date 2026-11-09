'use client';

import { useState } from 'react';
import { isolatePtInText } from '@/lib/v2/convo/ui/isolatePt';

export type CorrectionHintData = {
  severity: 'accent' | 'error';
  corrected_tl: string;
  changes: Array<{ from: string; to: string }>;
  note_eg: string;
  ar: string;
  original: string;
  /** 0-based index of this correction in the session (first 3 expanded). */
  index: number;
};

type Props = {
  data: CorrectionHintData;
  onAddCard?: (data: CorrectionHintData) => void;
};

function DiffLine({
  changes,
  corrected,
}: {
  changes: Array<{ from: string; to: string }>;
  corrected: string;
}) {
  if (changes.length === 0) {
    return (
      <span dir="ltr" lang="pt">
        {corrected}
      </span>
    );
  }
  return (
    <span
      dir="ltr"
      lang="pt"
      className="inline-flex flex-wrap items-baseline gap-y-1"
    >
      {changes.map((c, i) => (
        <span key={`${c.from}-${c.to}-${i}`} className="inline">
          {i > 0 ? (
            <span className="mx-1 text-[var(--ft-text-secondary)]">·</span>
          ) : null}
          {c.from ? (
            <span className="me-1 text-[var(--ft-correction)] line-through opacity-70">
              {c.from}
            </span>
          ) : null}
          <strong className="font-semibold text-[var(--ft-sage-dark)] underline decoration-[var(--ft-sage)] decoration-2 underline-offset-2">
            {c.to}
          </strong>
        </span>
      ))}
    </span>
  );
}

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

/** Attached correction card under the learner sage bubble (K3). */
export function CorrectionHint({ data, onAddCard }: Props) {
  const startCollapsed = data.index >= 3;
  const [expanded, setExpanded] = useState(!startCollapsed);
  const accentToken =
    data.changes[0]?.to || data.corrected_tl.split(/\s+/).find(Boolean) || '';

  if (data.severity === 'accent') {
    return (
      <div className="mt-1.5 max-w-full self-end rounded-2xl bg-[var(--ft-coach)] px-3 py-2 text-start shadow-[var(--ft-shadow-soft)]">
        <p
          dir="rtl"
          className="font-[family-name:var(--font-ft-ar)] text-[13px] text-[var(--ft-correction-text)]"
        >
          انتبه للعلامة:{' '}
          <bdi
            dir="ltr"
            className="font-[family-name:var(--font-ft-pt)] font-bold"
          >
            {accentToken}
          </bdi>
        </p>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-1.5 inline-flex items-center gap-1 self-end rounded-full border border-[var(--ft-border)] bg-[var(--ft-coach)] px-2.5 py-1 font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-correction-text)]"
      >
        <span aria-hidden>✏️</span> تصحيح
      </button>
    );
  }

  return (
    <aside className="mt-1.5 max-w-[min(100%,22rem)] self-end overflow-hidden rounded-2xl bg-[var(--ft-coach)] px-3 py-2.5 shadow-[var(--ft-shadow-soft)]">
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--ft-correction)_18%,transparent)] text-[var(--ft-correction-text)]"
        >
          <span className="material-symbols-rounded text-[16px]">edit</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-ft-pt)] text-[14px] font-semibold leading-snug text-[var(--ft-ink)]">
            <DiffLine corrected={data.corrected_tl} changes={data.changes} />
          </p>
          {data.note_eg ? (
            <p
              dir="rtl"
              className="mt-1.5 font-[family-name:var(--font-ft-ar)] text-[13px] leading-5 text-[var(--ft-correction-text)]"
            >
              {isolatePtInText(data.note_eg)}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void playPt(data.corrected_tl)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ft-sage)] text-white"
              aria-label="سمع التصحيح"
            >
              <span className="material-symbols-rounded text-[18px]">
                volume_up
              </span>
            </button>
            {onAddCard ? (
              <button
                type="button"
                onClick={() => onAddCard(data)}
                className="rounded-full border border-[var(--ft-border)] bg-white px-2.5 py-1 font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-ink)]"
              >
                ضيفها للكروت
              </button>
            ) : (
              <span className="rounded-full border border-[var(--ft-border)] bg-white/70 px-2.5 py-1 font-[family-name:var(--font-ft-ar)] text-[12px] text-[var(--ft-text-secondary)]">
                ضيفها للكروت
              </span>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
