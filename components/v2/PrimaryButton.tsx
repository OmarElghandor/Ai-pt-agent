import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({ children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex min-h-11 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-50',
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
