'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ConvoSessionSummary } from '@/lib/v2/convo/result';
import { ConvoResultCard } from './ConvoResultCard';
import type { ConvoResultStats } from '@/lib/v2/convo/result';

type Props = {
  summary: ConvoSessionSummary;
  /** Learn mode: keep existing result card under the summary. */
  lessonStats?: ConvoResultStats | null;
  lessonDay?: number | null;
  practiceHref: string;
  backHref: string;
  showPracticeCta?: boolean;
};

export function ConvoSummaryCard({
  summary,
  lessonStats,
  lessonDay,
  practiceHref,
  backHref,
  showPracticeCta = false,
}: Props) {
  const [addFlags, setAddFlags] = useState(() =>
    summary.recasts.map((r) => r.add_default),
  );

  return (
    <div className="flex flex-col gap-4 px-3 py-4">
      <div className="rounded-2xl border border-v2-line bg-v2-card px-4 py-5 shadow-[var(--shadow-v2-soft)]">
        <p className="text-center font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary">
          خلّصت المحادثة 👏
        </p>
        <p className="mt-1 text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          اتكلّمت حوالي {summary.minutes} دقيقة
        </p>

        {summary.lines.length > 0 ? (
          <div className="mt-4">
            <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-primary">
              اللي قلته بالبرتغالي
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {summary.lines.map((line, i) => (
                <li
                  key={`${i}-${line}`}
                  dir="ltr"
                  className="rounded-v2-row bg-v2-paper-deep/80 px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
                >
                  {line}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {summary.recasts.length > 0 ? (
          <div className="mt-4">
            <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] font-semibold text-v2-ink">
              تصحيحات ممكن تبقى كروت
            </p>
            <ul className="mt-2 flex flex-col gap-2">
              {summary.recasts.map((r, i) => (
                <li
                  key={`${i}-${r.corrected}`}
                  className="rounded-v2-row border border-v2-line/50 px-3 py-2"
                >
                  <p
                    dir="ltr"
                    className="font-[family-name:var(--font-v2-target)] text-xs text-v2-ink-muted line-through"
                  >
                    {r.original}
                  </p>
                  <p
                    dir="ltr"
                    className="font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
                  >
                    {r.corrected}
                  </p>
                  <label className="mt-1 flex items-center gap-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink">
                    <input
                      type="checkbox"
                      checked={addFlags[i] ?? false}
                      onChange={(e) => {
                        const next = [...addFlags];
                        next[i] = e.target.checked;
                        setAddFlags(next);
                      }}
                    />
                    ضيفها للكروت
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {showPracticeCta ? (
            <Link
              href={practiceHref}
              className="inline-flex min-h-11 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white"
            >
              اتكلم عنه دلوقتي
            </Link>
          ) : null}
          <Link
            href={backHref}
            className="inline-flex min-h-11 items-center justify-center rounded-v2-chip border border-v2-line px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary"
          >
            رجوع
          </Link>
        </div>
      </div>

      {lessonStats ? (
        <ConvoResultCard
          day={lessonDay ?? null}
          stats={lessonStats}
          freeTopicId={summary.topic_id}
        />
      ) : null}
    </div>
  );
}
