import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export function PrimaryButton({ children, className, ...rest }: Props) {
  return (
    <button
      type="button"
      className={[
        'inline-flex items-center justify-center rounded-v2-row bg-v2-ink px-4 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white disabled:opacity-50',
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
