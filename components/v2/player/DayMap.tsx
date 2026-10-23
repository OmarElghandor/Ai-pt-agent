'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readDonePages } from './session';

export type DayMapStep = {
  id: string;
  kind: 'page' | 'practice';
  title: string;
  subtitle?: string;
  minutes: number;
  href: string | null;
};

type Status = 'done' | 'current' | 'locked';

export function DayMap({
  day,
  situation,
  steps,
}: {
  day: number;
  situation?: { tl: string; eg: string };
  steps: DayMapStep[];
}) {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    setDone(readDonePages(day));
  }, [day]);

  const doneSet = new Set(done);
  let markedCurrent = false;
  const rows = steps.map((step) => {
    if (step.kind === 'practice') return { step, status: 'locked' as Status };
    if (doneSet.has(step.id)) return { step, status: 'done' as Status };
    if (!markedCurrent) {
      markedCurrent = true;
      return { step, status: 'current' as Status };
    }
    return { step, status: 'locked' as Status };
  });

  return (
    <main className="flex min-h-dvh flex-col px-4 py-4">
      <Link href="/path" className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        المسار
      </Link>
      <p className="mt-3 font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
        Dia {day}
      </p>
      <header className="mt-2 rounded-v2-card border border-v2-ink bg-v2-card px-4 py-4">
        <h1
          className="font-[family-name:var(--font-v2-target)] text-3xl text-v2-ink"
          dir="ltr"
        >
          {situation?.tl ?? `Dia ${day}`}
        </h1>
        {situation?.eg ? (
          <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-lg">{situation.eg}</p>
        ) : null}
      </header>
      <ol className="mt-4 space-y-2">
        {rows.map(({ step, status }, index) => {
          const body = (
            <span className="flex items-center gap-3">
              <span
                className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-v2-ui)] text-sm',
                  status === 'current'
                    ? 'bg-v2-ink text-white'
                    : status === 'done'
                      ? 'bg-v2-success text-white'
                      : 'bg-v2-rule text-v2-ink-muted',
                ].join(' ')}
              >
                {status === 'done' ? '✓' : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                {step.subtitle ? (
                  <span className="block font-[family-name:var(--font-v2-ui)] text-[11px] text-v2-ink-muted">
                    {step.subtitle}
                  </span>
                ) : null}
                <span className="block truncate font-[family-name:var(--font-v2-arabic)] text-base">
                  {step.title}
                </span>
              </span>
              <span className="shrink-0 font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
                {step.minutes} د
              </span>
            </span>
          );
          const className = [
            'block rounded-v2-card border px-3 py-3',
            status === 'current'
              ? 'border-2 border-v2-highlight-border bg-v2-highlight-fill'
              : status === 'done'
                ? 'border-v2-ink bg-v2-card'
                : 'border-v2-rule bg-v2-card opacity-60',
          ].join(' ');
          if (status === 'locked' || !step.href) {
            return (
              <li key={step.id}>
                <div className={className} aria-disabled="true">
                  {body}
                </div>
              </li>
            );
          }
          return (
            <li key={step.id}>
              <Link href={step.href} className={className}>
                {body}
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
