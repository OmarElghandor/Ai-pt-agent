'use client';

import { CoachAvatar } from './CoachMessage';

type Props = {
  label: string;
};

export function TypingRow({ label }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <CoachAvatar />
      <div className="rounded-full border border-v2-line bg-v2-paper px-4 py-2 shadow-sm">
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {label}
          <span className="animate-pulse">…</span>
        </p>
      </div>
    </div>
  );
}