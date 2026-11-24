'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ReviewChatShell } from '@/components/v2/review-chat';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { loadReviewFixtureAllTypes } from '@/lib/v2/review-chat/fixture';
import type { ReviewSession } from '@/lib/v2/review-chat/types';
import {
  reviewEmptyCopyEg,
  type ReviewEmptyReason,
} from '@/lib/v2/practice/reviewEmpty';

type ReviewRes = ReviewSession & {
  empty_reason?: ReviewEmptyReason;
};

export function DailyReviewSession({
  dayOverride,
  fixture,
  learnerName,
}: {
  dayOverride: number | null;
  fixture?: 'all-types' | null;
  learnerName?: string;
}) {
  const [data, setData] = useState<ReviewRes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fixtureSession = useMemo(() => {
    if (fixture !== 'all-types') return null;
    return loadReviewFixtureAllTypes(learnerName);
  }, [fixture, learnerName]);

  useEffect(() => {
    if (fixtureSession) {
      setData(fixtureSession as ReviewRes);
      return;
    }
    let cancelled = false;
    const q = dayOverride != null ? `?day=${dayOverride}` : '';
    void fetch(`/api/v2/review/today${q}`, {
      headers: {
        'x-timezone':
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : 'UTC',
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`review ${res.status}`);
        return res.json() as Promise<ReviewRes>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dayOverride, fixtureSession]);

  if (error) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
          مش قادرين نحمّل المراجعة دلوقتي.
        </p>
        <Link href="/path" className="text-v2-primary">
          رجوع
        </Link>
      </main>
    );
  }

  if (!data) {
    return <ScreenLoading label="بنجهّز مراجعة النهارده…" />;
  }

  if (data.empty) {
    const copy = reviewEmptyCopyEg(data.empty_reason, {
      completedDays: data.completed_days ?? [],
      currentDay: data.current_day ?? 1,
    });
    const href =
      copy.ctaDay != null && copy.ctaDay > 0
        ? `/day/${copy.ctaDay}`
        : '/path';
    return (
      <main className="flex flex-1 flex-col items-stretch justify-center gap-4 p-6">
        <p className="font-[family-name:var(--font-v2-arabic)] text-lg text-v2-ink">
          {copy.title}
        </p>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {copy.detail}
        </p>
        <Link
          href={href}
          className="rounded-full bg-v2-primary px-5 py-3 text-center font-[family-name:var(--font-v2-arabic)] text-v2-on-primary"
        >
          روح للدرس
        </Link>
      </main>
    );
  }

  if (!data.steps.length) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="font-[family-name:var(--font-v2-arabic)]">
          مفيش أسئلة مراجعة جاهزة.
        </p>
        <Link href="/path">رجوع للمسار</Link>
      </main>
    );
  }

  return (
    <ReviewChatShell
      session={data}
      learnerName={learnerName ?? data.learner_name ?? 'صديقي'}
      fixtureMode={fixture === 'all-types'}
    />
  );
}