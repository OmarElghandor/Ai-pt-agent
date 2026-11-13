'use client';

import { useEffect, useState } from 'react';

type Summary = {
  streak: {
    current: number;
    grace_line: string | null;
  };
};

function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

function greetingEg(hour: number): string {
  if (hour < 12) return 'صباح النور';
  if (hour < 18) return 'مساء الخير';
  return 'مساء النور';
}

export function HomeSummaryHeader({
  name,
  image,
  initialStreak = 0,
}: {
  name: string;
  image: string | null;
  initialStreak?: number;
}) {
  const [streak, setStreak] = useState(initialStreak);
  const [graceLine, setGraceLine] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('أهلاً');

  useEffect(() => {
    setGreeting(greetingEg(new Date().getHours()));
  }, []);

  useEffect(() => {
    void fetch('/api/v2/me/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary | null) => {
        if (!data) return;
        setStreak(data.streak.current);
        setGraceLine(data.streak.grace_line);
      })
      .catch(() => {});
  }, []);

  const displayName = firstName(name);
  const initial = displayName.slice(0, 1).toUpperCase();

  return (
    <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-v2-line bg-v2-paper/90 px-4 pb-3 pt-3 backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-v2-primary-tint p-0.5 ring-2 ring-v2-primary/20">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="size-full rounded-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center rounded-full bg-v2-primary-tint font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-primary">
              {initial}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-[family-name:var(--font-v2-arabic)] text-base font-bold leading-tight text-v2-ink">
            {greeting} يا {displayName}
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-medium text-v2-ink-muted">
            مستمر في استكشاف البرتغالية
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div className="flex items-center gap-1.5 rounded-full border border-v2-line bg-v2-card px-3 py-1.5 shadow-sm">
          <span aria-hidden>🔥</span>
          <span className="font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-primary">
            {streak} أيام متواصلة
          </span>
        </div>
        {graceLine ? (
          <p className="max-w-[9rem] text-end font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
            {graceLine}
          </p>
        ) : null}
      </div>
    </header>
  );
}
