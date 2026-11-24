'use client';

import { useEffect, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';

const BARS = 11;

type Props = {
  text: string;
  playing?: boolean;
};

export function AudioPrompt({ text, playing }: Props) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(Boolean(playing));
  }, [playing]);

  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-v2-panel p-2.5">
      <AudioButton
        text={text}
        label="تشغيل الصوت"
        showSlow
        className="shrink-0"
      />
      <div className="flex h-6 flex-1 items-center justify-between gap-0.5 px-1" dir="ltr" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            className={[
              'w-1 rounded-full bg-v2-primary',
              active ? 'animate-pulse' : 'opacity-40',
            ].join(' ')}
            style={{ height: `${8 + ((i * 7) % 14)}px` }}
          />
        ))}
      </div>
    </div>
  );
}