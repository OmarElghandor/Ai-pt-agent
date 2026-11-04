'use client';

import { useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';

type Props = {
  tl: string;
  say?: string;
  streaming?: boolean;
  /** Egyptian / MSA meaning — revealed via معناها؟ */
  meaningEg?: string;
};

export function CharacterBubble({
  tl,
  say,
  streaming,
  meaningEg,
}: Props) {
  const [showMeaning, setShowMeaning] = useState(false);

  return (
    <div className="flex max-w-[85%] flex-col items-start gap-1 self-start">
      <div className="relative rounded-2xl rounded-br-md border border-white/80 bg-white/95 px-3.5 py-2.5 shadow-[var(--shadow-v2-soft)] ring-1 ring-v2-primary/10">
        <p
          dir="ltr"
          lang="pt"
          className="text-start font-[family-name:var(--font-v2-target)] text-[15px] font-semibold leading-snug tracking-tight text-v2-primary"
        >
          {tl}
          {streaming ? (
            <span className="ms-0.5 inline-block h-3 w-1 animate-pulse rounded-sm bg-v2-action align-middle" />
          ) : null}
        </p>
        {say ? (
          <p
            dir="rtl"
            className="mt-1 text-end font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted"
          >
            {say}
          </p>
        ) : null}
        {showMeaning && meaningEg ? (
          <p
            dir="rtl"
            className="mt-1 border-t border-v2-line/50 pt-1 text-end font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink"
          >
            {meaningEg}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          {tl.trim() ? (
            <AudioButton text={tl} lang="pt" size="chip" label="اسمع" />
          ) : (
            <span />
          )}
          {meaningEg ? (
            <button
              type="button"
              onClick={() => setShowMeaning((v) => !v)}
              className="font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-primary/80 underline-offset-2 hover:underline"
            >
              {showMeaning ? 'إخفاء المعنى' : 'معناها؟'}
            </button>
          ) : (
            <span
              className="font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted/50"
              title="المعنى هيتضاف لاحقاً"
            >
              معناها؟
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
