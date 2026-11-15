'use client';

import { useState } from 'react';

type Props = {
  eg: string;
  hintEg?: string;
};

/** Always-visible «دورك» strip under the latest character bubble. Tap shows hint. */
export function RoleplayDoStrip({ eg, hintEg }: Props) {
  const [hintOpen, setHintOpen] = useState(false);
  const canHint = Boolean(hintEg?.trim());

  return (
    <div className="mt-1.5 w-full max-w-[92%] self-start">
      <button
        type="button"
        onClick={() => {
          if (canHint) setHintOpen((v) => !v);
        }}
        aria-expanded={canHint ? hintOpen : undefined}
        className="flex w-full flex-col gap-1 rounded-v2-row bg-v2-primary-tint/70 px-3 py-2 text-start ring-1 ring-v2-primary/15"
      >
        <span className="font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-primary">
          دورك
        </span>
        <span className="font-[family-name:var(--font-v2-arabic)] text-sm leading-snug text-v2-ink">
          {eg}
        </span>
        {hintOpen && hintEg ? (
          <span className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-xs leading-snug text-v2-ink-muted">
            {hintEg}
          </span>
        ) : null}
      </button>
    </div>
  );
}
