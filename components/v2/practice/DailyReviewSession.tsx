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
  canRegenerate = false,
}: {
  dayOverride: number | null;
  fixture?: 'all-types' | null;
  learnerName?: string;
  /** Testing: show the "ولّد من جديد" button (admins / non-production). */
  canRegenerate?: boolean;
}) {
  const [data, setData] = useState<ReviewRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  // Remount the chat after a rebuild so no local answer state carries over.
  const [generation, setGeneration] = useState(0);

  const regenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const q = dayOverride != null ? `?day=${dayOverride}` : '';
      const res = await fetch(`/api/v2/review/today/regenerate${q}`, {
        method: 'POST',
        headers: {
          'x-timezone':
            typeof Intl !== 'undefined'
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : 'UTC',
        },
      });
      if (!res.ok) throw new Error(`regenerate ${res.status}`);
      setData((await res.json()) as ReviewRes);
      setGeneration((g) => g + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const regenerateButton =
    canRegenerate && !fixture ? (
      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={regenerating}
        className="rounded-full border border-v2-line px-5 py-3 text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink disabled:opacity-60"
      >
        {regenerating ? 'بنولّد…' : 'ولّد المراجعة من جديد'}
      </button>
    ) : null;

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
        {regenerateButton}
      </main>
    );
  }

  if (!data || regenerating) {
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
        {regenerateButton}
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
        {regenerateButton}
      </main>
    );
  }

  return (
    <ReviewChatShell
      key={generation}
      session={data}
      learnerName={learnerName ?? data.learner_name ?? 'صديقي'}
      fixtureMode={fixture === 'all-types'}
      onRegenerate={canRegenerate && !fixture ? () => void regenerate() : undefined}
    />
  );
}