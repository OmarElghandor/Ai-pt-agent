'use client';

import Link from 'next/link';
import type { ConvoResultStats } from '@/lib/v2/convo/result';

type Props = {
  day: number | null;
  stats: ConvoResultStats;
};

/** End-of-lesson result card (09 §4.4): بتقول / بتفهم / extra. */
export function ConvoResultCard({ day, stats }: Props) {
  return (
    <div className="mt-4 rounded-2xl border border-v2-line bg-v2-card px-4 py-5 shadow-[var(--shadow-v2-soft)]">
      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary">
        خلّصت المحادثة 👏
      </p>
      <p className="mt-2 text-center font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-action">
        {stats.headline_eg}
      </p>

      {stats.said.length > 0 ? (
        <div className="mt-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-primary">
            بتقولها
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.said.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill bg-v2-primary/10 px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] font-semibold text-v2-primary"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.understood.length > 0 ? (
        <div className="mt-3">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-ink">
            بتفهمها، هتيجي كارت بكرة
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.understood.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill bg-v2-paper-deep px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] text-v2-ink"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {stats.extra.length > 0 ? (
        <div className="mt-3">
          <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-ink-muted">
            كلمات زيادة سمعتها
          </p>
          <ul className="mt-1.5 flex flex-wrap justify-end gap-1.5">
            {stats.extra.map((item) => (
              <li
                key={item.item_id}
                dir="ltr"
                className="rounded-v2-pill border border-v2-line px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[12px] text-v2-ink-muted"
              >
                {item.tl}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {day ? (
        <div className="mt-5 text-center">
          <Link
            href={`/day/${day}`}
            className="inline-block font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action"
          >
            رجوع لليوم
          </Link>
        </div>
      ) : null}
    </div>
  );
}
