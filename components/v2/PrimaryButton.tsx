import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Renders a link with the same styles. A button inside a link does not navigate. */
  href?: string;
};

export function PrimaryButton({ children, className, href, ...rest }: Props) {
  const cls = [
    'inline-flex min-h-11 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-50',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
