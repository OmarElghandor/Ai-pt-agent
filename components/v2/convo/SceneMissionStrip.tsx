'use client';

import { useEffect, useRef, useState } from 'react';

export type SceneMissionGoal = {
  id: string;
  label_eg: string;
};

type Props = {
  introEg: string;
  goals: SceneMissionGoal[];
  currentGoalId: string | null;
  doneIds: ReadonlySet<string> | string[];
  skippedIds?: ReadonlySet<string> | string[];
};

/**
 * Pinned scene mission: one-line intro_eg; tap to expand goal checklist.
 */
export function SceneMissionStrip({
  introEg,
  goals,
  currentGoalId,
  doneIds,
  skippedIds = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds);
  const skipped =
    skippedIds instanceof Set ? skippedIds : new Set(skippedIds);
  const progressed = goals.filter(
    (g) => done.has(g.id) || skipped.has(g.id),
  ).length;
  const total = goals.length;
  const prevDoneRef = useRef<Set<string>>(new Set());
  const [justDone, setJustDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = doneIds instanceof Set ? doneIds : new Set(doneIds);
    const prev = prevDoneRef.current;
    const newly = new Set<string>();
    for (const id of next) {
      if (!prev.has(id)) newly.add(id);
    }
    prevDoneRef.current = new Set(next);
    if (newly.size === 0) return;
    setJustDone(newly);
    const t = window.setTimeout(() => setJustDone(new Set()), 700);
    return () => window.clearTimeout(t);
  }, [doneIds]);

  if (!introEg.trim() || total === 0) return null;

  return (
    <div className="shrink-0 border-b border-[var(--ft-border)]/50 bg-[color-mix(in_srgb,var(--ft-ivory)_92%,transparent)] px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-2 text-start"
        aria-expanded={open}
      >
        <span aria-hidden className="mt-0.5 text-[14px]">
          🎯
        </span>
        <span className="min-w-0 flex-1 font-[family-name:var(--font-ft-ar)] text-[13px] leading-snug text-[var(--ft-ink)]">
          {introEg}
        </span>
        <span className="shrink-0 font-[family-name:var(--font-ft-ar)] text-[11px] text-[var(--ft-text-secondary)]">
          {progressed} من {total}
        </span>
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-[var(--ft-border)]/40 pt-2">
          {goals.map((g) => {
            const isDone = done.has(g.id);
            const isSkipped = skipped.has(g.id);
            const isCurrent = g.id === currentGoalId;
            const tick = justDone.has(g.id);
            return (
              <li
                key={g.id}
                className={[
                  'flex items-center gap-2 font-[family-name:var(--font-ft-ar)] text-[12px] transition-colors duration-300',
                  isDone || isSkipped
                    ? 'text-[var(--ft-text-secondary)]'
                    : isCurrent
                      ? 'font-bold text-[var(--ft-ink)]'
                      : 'text-[var(--ft-ink)]',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] transition-transform duration-300',
                    isDone
                      ? 'bg-[var(--ft-moss)] text-white'
                      : 'ring-1 ring-[var(--ft-border)]',
                    tick ? 'scale-125' : 'scale-100',
                  ].join(' ')}
                  aria-hidden
                >
                  {isDone ? '✓' : isSkipped ? '–' : ''}
                </span>
                <span>{g.label_eg}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
