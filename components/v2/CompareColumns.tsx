import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  /** Stay side by side down to 360px. Defaults to 2. */
  columns?: 1 | 2 | 3;
};

const COLS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

/** Equal columns that stay side by side down to 360px (8px gap). */
export function CompareColumns({ children, className, columns = 2 }: Props) {
  return (
    <div
      className={[
        'grid gap-2',
        COLS[columns],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
