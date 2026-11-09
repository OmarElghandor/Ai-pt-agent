import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '@/components/v2/Icon';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Renders a link with the same styles. A button inside a link does not navigate. */
  href?: string;
  /** Optional trailing arrow (Calm Kit primary CTA). */
  withArrow?: boolean;
};

export function PrimaryButton({
  children,
  className,
  href,
  withArrow = false,
  ...rest
}: Props) {
  const cls = [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-50',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {children}
      {withArrow ? <Icon name="arrow_forward" size={20} className="text-white" /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {content}
    </button>
  );
}
