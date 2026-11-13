'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Summary = {
  name: string;
  current_day: number | null;
  current_day_title_ar: string | null;
  bakra: boolean;
  streak: {
    current: number;
    best: number;
    today_counts: boolean;
    grace_left: number;
    grace_line: string | null;
  };
  levels: { understood: number; said: number };
  deck: { left: number; total: number; done: boolean };
  suggestion: { kind: string; text: string } | null;
  weak_spots: Array<{ problem: string; title_ar: string }>;
};

export function HomeSummaryHeader() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    void fetch('/api/v2/me/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Summary | null) => setSummary(data))
      .catch(() => {});
  }, []);

  if (!summary) return null;

  const dayLabel = summary.bakra
    ? `بكرة · يوم ${summary.current_day ?? '—'}`
    : `يوم ${summary.current_day ?? '—'}`;

  return (
    <section className="mb-4 flex flex-col gap-3 rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            أهلاً {summary.name}
          </p>
          <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
            {dayLabel}
            {summary.current_day_title_ar
              ? ` · ${summary.current_day_title_ar}`
              : ''}
          </h2>
        </div>
        <div className="text-left">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-action">
            {summary.streak.current} أيام ورا بعض
          </p>
          {summary.streak.grace_line ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
              {summary.streak.grace_line}
            </p>
          ) : null}
        </div>
      </div>
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        بتفهم {summary.levels.understood} · بتقول {summary.levels.said}
      </p>
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        {summary.deck.done
          ? 'كروت النهارده خلصت'
          : summary.deck.total
            ? `الكروت: فاضل ${summary.deck.left} من ${summary.deck.total}`
            : 'مفيش كروت مبنية النهارده لسه'}
      </p>
      {summary.suggestion ? (
        <p className="rounded-lg bg-v2-sand/30 px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          {summary.suggestion.text}
        </p>
      ) : null}
      {summary.weak_spots[0] ? (
        <Link
          href="/me/gaps"
          className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action"
        >
          نواقصك · {summary.weak_spots[0].title_ar}
        </Link>
      ) : null}
    </section>
  );
}
