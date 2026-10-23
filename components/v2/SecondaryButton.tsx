import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function SecondaryButton({ children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center rounded-v2-row border border-v2-ink bg-transparent px-4 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-ink disabled:opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
