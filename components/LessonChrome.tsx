'use client';

import type { Chip } from '@/lib/progressTypes';
import type { AssessmentHeader, StageHeader } from '@/lib/learnerView';

export function ChipRow({
  chips,
  disabled,
  onChip,
}: {
  chips: Chip[];
  disabled?: boolean;
  onChip: (chip: Chip) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2 justify-end">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          onClick={() => onChip(chip)}
          className="rounded-full border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-100 disabled:opacity-40"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

export function PracticeHeader({ header }: { header: StageHeader }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <div className="flex flex-wrap gap-2 justify-center">
        {header.stages.map((s) => (
          <span
            key={s.id}
            className={
              s.state === 'current'
                ? 'rounded-full bg-emerald-500/25 px-2 py-0.5 text-xs text-emerald-300'
                : s.state === 'done'
                  ? 'rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-300'
                  : 'rounded-full bg-zinc-800/40 px-2 py-0.5 text-xs text-zinc-500'
            }
          >
            {s.label}
          </span>
        ))}
      </div>
      {header.detail ? (
        <div className="text-center text-[11px] text-zinc-500" dir="ltr">
          {header.detail}
        </div>
      ) : null}
    </div>
  );
}

export function AssessmentHeaderBar({ header }: { header: AssessmentHeader }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center px-1">
      {header.targets.map((t) => (
        <span
          key={t.target}
          className={
            t.state === 'current'
              ? 'rounded-full bg-sky-500/25 px-2 py-0.5 text-xs text-sky-300'
              : t.state === 'done'
                ? 'rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-300'
                : 'rounded-full bg-zinc-800/40 px-2 py-0.5 text-xs text-zinc-500'
          }
        >
          {t.target}
          {t.outcome === 'pass' ? ' ✓' : t.outcome === 'fail' ? ' ✗' : ''}
        </span>
      ))}
    </div>
  );
}

export function WordBank({
  words,
  frame,
  onInsert,
}: {
  words: { pt: string; meaning: string }[];
  frame?: string | null;
  onInsert: (pt: string) => void;
}) {
  return (
    <div className="space-y-2">
      {frame ? (
        <div className="text-center text-xs text-zinc-400" dir="ltr">
          {frame}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 justify-center">
        {words.map((w) => (
          <button
            key={w.pt}
            type="button"
            onClick={() => onInsert(w.pt)}
            className="rounded-xl border border-zinc-600 bg-zinc-800 px-2 py-1 text-center"
          >
            <div className="text-sm text-emerald-300" dir="ltr">
              {w.pt}
            </div>
            <div className="text-[10px] text-zinc-400">{w.meaning}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
