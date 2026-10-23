import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

/** Two equal columns that stay side by side down to 360px (8px gap). */
export function CompareColumns({ children, className }: Props) {
  return (
    <div
      className={[
        'grid grid-cols-2 gap-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
