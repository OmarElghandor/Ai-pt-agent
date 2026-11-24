'use client';

import Link from 'next/link';
import { pickVariant } from '@/lib/v2/review-chat/coach';
import { toArDigits } from '@/lib/v2/formatAr';
import { CoachMessage } from './CoachMessage';

type LessonRow = {
  title: string;
  subtitle?: string;
  status: string;
};

type Props = {
  lessons: LessonRow[];
  streak?: number;
};

export function SessionEndCard({ lessons, streak }: Props) {
  const title = pickVariant('session_end_title', 0);
  const sub = pickVariant('session_end_sub', 0);

  return (
    <CoachMessage>
      <div className="w-full space-y-5 rounded-2xl border border-v2-line bg-v2-paper p-6 shadow-md">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-v2-primary-tint text-v2-success text-3xl">
            ✓
          </span>
          <h2 className="font-[family-name:var(--font-v2-arabic)] text-xl font-bold text-v2-ink">
            {title}
          </h2>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {sub}
          </p>
        </div>
        <div className="divide-y divide-v2-line overflow-hidden rounded-xl border border-v2-line">
          {lessons.map((row) => (
            <div
              key={row.title}
              className="flex items-center justify-between gap-3 bg-v2-panel/50 p-3.5"
            >
              <div className="min-w-0">
                <p className="truncate font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
                  {row.title}
                </p>
                {row.subtitle ? (
                  <p className="truncate font-[family-name:var(--font-v2-target)] text-xs text-v2-meta" dir="ltr">
                    {row.subtitle}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-v2-panel px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-v2-ink-muted">
                {row.status}
              </span>
            </div>
          ))}
        </div>
        {streak != null && streak > 0 ? (
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            سلسلة الأيام: {toArDigits(streak)}
          </p>
        ) : null}
        <Link
          href="/path"
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-on-primary"
        >
          رجوع للمسار
        </Link>
      </div>
    </CoachMessage>
  );
}