'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type DailyClip = {
  clip_id: string;
  series_slug: string;
  clip_slug: string;
  title_ar: string;
  title_tl: string;
  layout: string;
  level: number;
};

/** Home card «لقطة النهارده» under the lesson hero (19 M7). */
export function DailyMicroCard() {
  const [clip, setClip] = useState<DailyClip | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/micro/daily');
        if (!res.ok) return;
        const data = (await res.json()) as { clip?: DailyClip | null };
        if (!cancelled) setClip(data.clip ?? null);
      } catch {
        /* quiet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!clip) return null;

  return (
    <section className="-mx-4 px-4 py-2">
      <Link
        href={`/micro/${clip.series_slug}`}
        className="flex items-center gap-3 rounded-v2-card bg-v2-card p-3 shadow-[var(--shadow-v2-soft)]"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-v2-primary-tint text-lg text-v2-primary">
          ◈
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
            لقطة النهارده
          </p>
          <p className="truncate font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-ink">
            {clip.title_ar}
          </p>
          <p
            dir="ltr"
            className="truncate font-[family-name:var(--font-v2-target)] text-xs text-v2-ink-muted"
          >
            {clip.title_tl}
          </p>
        </div>
      </Link>
    </section>
  );
}
