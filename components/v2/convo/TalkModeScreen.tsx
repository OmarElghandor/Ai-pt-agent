'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';

const STORAGE_KEY = 'v2.talk.lastMode';

export type TalkMode = 'practice' | 'learn';

function readLastMode(): TalkMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'practice' || v === 'learn') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLastMode(mode: TalkMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

const MODES: Array<{
  id: TalkMode;
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
}> = [
  {
    id: 'practice',
    href: '/talk/practice',
    emoji: '🗣️',
    title: 'اتكلّم',
    subtitle: 'اتمرّن تتكلم في أي موضوع',
  },
  {
    id: 'learn',
    href: '/talk/learn',
    emoji: '📖',
    title: 'اتعلّم',
    subtitle: 'افهم موضوع خطوة بخطوة',
  },
];

export function TalkModeScreen() {
  const [last, setLast] = useState<TalkMode | null>(null);

  useEffect(() => {
    setLast(readLastMode());
  }, []);

  return (
    <div className="flex flex-col gap-6 px-4 pb-8 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href="/path"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={22} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            محادثة
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            عايز تتكلم ولا تتعلّم؟
          </p>
        </div>
      </header>

      <ul className="flex flex-col gap-3">
        {MODES.map((mode) => {
          const selected = last === mode.id;
          return (
            <li key={mode.id}>
              <Link
                href={mode.href}
                onClick={() => writeLastMode(mode.id)}
                className={[
                  'flex min-h-28 flex-col justify-center gap-1 rounded-v2-card px-5 py-5 shadow-[var(--shadow-v2-soft)] transition',
                  selected
                    ? 'bg-v2-primary text-white ring-2 ring-v2-action'
                    : 'bg-v2-card text-v2-primary',
                ].join(' ')}
                aria-current={selected ? 'true' : undefined}
              >
                <span className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold">
                  <span aria-hidden className="me-2">
                    {mode.emoji}
                  </span>
                  {mode.title}
                </span>
                <span
                  className={[
                    'font-[family-name:var(--font-v2-arabic)] text-base',
                    selected ? 'text-white/85' : 'text-v2-ink-muted',
                  ].join(' ')}
                >
                  {mode.subtitle}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
