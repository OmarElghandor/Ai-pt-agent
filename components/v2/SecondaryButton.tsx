import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function SecondaryButton({ children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex min-h-11 items-center justify-center rounded-v2-chip border border-v2-primary bg-transparent px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary disabled:opacity-50',
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
