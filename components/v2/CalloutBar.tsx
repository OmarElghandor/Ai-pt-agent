import type { ReactNode } from 'react';
import { Icon } from '@/components/v2/Icon';

type Props = {
  children: ReactNode;
  /** Small chip on the trailing side, e.g. an ending */
  chip?: ReactNode;
  className?: string;
};

/** Deep-teal key-rule bar. */
export function CalloutBar({ children, chip, className }: Props) {
  return (
    <div
      className={[
        'flex items-center gap-2 rounded-v2-row bg-v2-primary px-4 py-3 text-white shadow-[var(--shadow-v2-soft)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon name="auto_awesome" size={24} className="shrink-0 text-v2-note" />
      <div
        dir="rtl"
        className="min-w-0 flex-1 text-start font-[family-name:var(--font-v2-arabic)] text-sm font-semibold leading-snug"
      >
        {children}
      </div>
      {chip ? (
        <span
          dir="ltr"
          className="shrink-0 rounded-v2-chip bg-white/20 px-2.5 py-0.5 font-[family-name:var(--font-v2-target)] text-sm font-bold"
        >
          {chip}
        </span>
      ) : null}
    </div>
  );
}
