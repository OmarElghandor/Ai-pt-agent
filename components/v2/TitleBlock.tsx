import type { ReactNode } from 'react';

type Props = {
  /** Small pill above the title, e.g. القواعد */
  pill?: string;
  /** Serif Latin / TL title */
  title: ReactNode;
  /** Arabic subtitle */
  subtitle?: ReactNode;
  className?: string;
};

/** Warm Editorial page header: pill + Newsreader title + Arabic subtitle. */
export function TitleBlock({ pill, title, subtitle, className }: Props) {
  return (
    <header
      className={['text-center', className].filter(Boolean).join(' ')}
    >
      {pill ? (
        <span className="inline-flex rounded-v2-chip bg-v2-paper-deep px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
          {pill}
        </span>
      ) : null}
      <h1 className="mt-2 font-[family-name:var(--font-v2-target)] text-[32px] font-bold leading-10 text-v2-primary">
        {title}
      </h1>
      {subtitle ? (
        <p
          dir="rtl"
          className="mt-1 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted"
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
