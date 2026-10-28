import type { ReactNode } from 'react';
import type { RtGroup } from '@/lib/v2/rt';

const HEADER: Record<RtGroup, string> = {
  a: 'bg-v2-group-a text-white',
  b: 'bg-v2-group-b text-white',
  c: 'bg-v2-group-c text-white',
  m: 'bg-v2-group-m text-white',
  f: 'bg-v2-group-f text-white',
  verb: 'bg-v2-group-verb text-white',
  prep: 'bg-v2-group-prep text-white',
  pron: 'bg-v2-group-pron text-white',
  neg: 'bg-v2-group-neg text-white',
  neutral: 'bg-v2-primary text-white',
};

const COUNT_CHIP: Record<RtGroup, string> = {
  a: 'bg-v2-group-a/15 text-v2-group-a',
  b: 'bg-v2-group-b/15 text-v2-group-b',
  c: 'bg-v2-group-c/15 text-v2-group-c',
  m: 'bg-v2-group-m/15 text-v2-group-m',
  f: 'bg-v2-group-f/15 text-v2-group-f',
  verb: 'bg-v2-group-verb-bg text-v2-group-verb',
  prep: 'bg-v2-group-prep/15 text-v2-group-prep',
  pron: 'bg-v2-group-pron/15 text-v2-group-pron',
  neg: 'bg-v2-group-neg-bg text-v2-group-neg',
  neutral: 'bg-v2-paper-deep text-v2-primary',
};

type Props = {
  title: string;
  group?: RtGroup;
  /** Pill on the end of the header strip, e.g. ثابت / مؤقت */
  pill?: string;
  /** Sub-header question; defaults to بنستخدمه إمتى؟ */
  whenLabel?: string;
  /** Count chip next to whenLabel, e.g. ٣ قواعد */
  countLabel?: string;
  children: ReactNode;
  className?: string;
  /** Dim only the body children; header + sub-header stay full strength */
  dimmedContent?: boolean;
};

export function Panel({
  title,
  group = 'neutral',
  pill,
  whenLabel = 'بنستخدمه إمتى؟',
  countLabel,
  children,
  className,
  dimmedContent,
}: Props) {
  return (
    <section
      className={[
        'min-w-0 overflow-hidden rounded-v2-card bg-v2-card shadow-[var(--shadow-v2-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header
        className={[
          'flex items-center justify-between gap-1 px-2 py-1.5 font-[family-name:var(--font-v2-ui)] text-xs font-semibold sm:px-3 sm:text-sm',
          HEADER[group],
        ].join(' ')}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" aria-hidden />
          <span className="truncate">{title}</span>
        </span>
        {pill ? (
          <span className="shrink-0 rounded-v2-chip bg-white/20 px-2 py-0.5 text-[10px] font-medium sm:text-xs">
            {pill}
          </span>
        ) : null}
      </header>

      <div className="flex items-center justify-between gap-1 border-b border-v2-line px-2 py-1.5 sm:px-3">
        <span
          dir="rtl"
          className="text-start font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-ink sm:text-xs"
        >
          {whenLabel}
        </span>
        {countLabel ? (
          <span
            className={[
              'shrink-0 rounded-v2-chip px-1.5 py-0.5 font-[family-name:var(--font-v2-ui)] text-[10px] font-semibold sm:text-[11px]',
              COUNT_CHIP[group],
            ].join(' ')}
          >
            {countLabel}
          </span>
        ) : null}
      </div>

      <div
        className={[
          'p-4',
          dimmedContent ? 'opacity-20' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </div>
    </section>
  );
}
