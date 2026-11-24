'use client';

import { AudioButton } from '@/components/v2/AudioButton';

type Props = {
  name: string;
  tl: string;
};

export function QuotedMessage({ name, tl }: Props) {
  return (
    <div className="rounded-xl border border-v2-line bg-v2-panel p-3">
      <p className="truncate font-[family-name:var(--font-v2-ui)] text-xs font-semibold text-v2-ink-muted">
        {name}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <AudioButton text={tl} size="chip" label={`اسمع ${name}`} />
        <p className="font-[family-name:var(--font-v2-target)] text-sm font-medium text-v2-ink" dir="ltr">
          {tl}
        </p>
      </div>
    </div>
  );
}