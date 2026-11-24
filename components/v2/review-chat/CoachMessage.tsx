'use client';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export function CoachAvatar() {
  return (
    <div
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-v2-primary font-[family-name:var(--font-v2-ui)] text-xs font-bold leading-none tracking-tight text-v2-on-primary shadow-sm"
      aria-hidden
    >
      <span className="whitespace-nowrap">AZ</span>
    </div>
  );
}

export function CoachMessage({ children, className }: Props) {
  return (
    <div className={`flex items-start gap-2.5 ${className ?? ''}`}>
      <CoachAvatar />
      <div className="min-w-0 max-w-[85%]">{children}</div>
    </div>
  );
}