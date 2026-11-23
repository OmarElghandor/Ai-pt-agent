'use client';

/**
 * مراجعة النهارده — reuses QuestionSession + SessionEnd (16 §2.1 / §5.8).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { QuestionSession } from '@/components/v2/questions/QuestionSession';
import { SessionEnd } from '@/components/v2/questions/SessionEnd';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { toArDigits } from '@/lib/v2/formatAr';
import type { Question } from '@/lib/v2/content/lesson';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';

type ReviewStep = {
  kind: string;
  lesson_day: number;
  pairs: Array<{ item_id: string; skill: string }>;
  slot_reason: string;
  estimated_seconds: number;
  round: number;
  question?: Record<string, unknown> | null;
  result?: { correct?: boolean } | null;
};

type ReviewRes = {
  local_date: string;
  budget_minutes: number;
  window: Array<{ day: number; position: number }>;
  steps: ReviewStep[];
  rounds_total: number;
  rounds_done: number;
  status: string;
  current_day: number;
  empty?: boolean;
  resume?: { round: number; step: number };
};

function stepToQuestion(step: ReviewStep, index: number): Question | null {
  const q = step.question;
  if (!q || typeof q !== 'object') return null;
  const type = String(q.type ?? 'read_meaning');
  return {
    id: String(q.id ?? `review-${index}`),
    type,
    skill:
      step.pairs[0]?.skill === 'listening'
        ? 'listening'
        : step.pairs[0]?.skill === 'writing' ||
            step.pairs[0]?.skill === 'building'
          ? 'writing'
          : step.pairs[0]?.skill === 'speaking' ||
              step.pairs[0]?.skill === 'use'
            ? 'speaking'
            : 'grammar',
    tests: Array.isArray(q.tests)
      ? (q.tests as string[])
      : step.pairs.map((p) => p.item_id),
    prompt: q.prompt ?? { stimulus: q.prompt_eg ?? '' },
    prompt_eg: typeof q.prompt_eg === 'string' ? q.prompt_eg : undefined,
    options: q.options,
    tiles: q.tiles,
    answer: q.answer,
    use: 'practice',
  } as unknown as Question;
}

export function DailyReviewSession({
  dayOverride,
}: {
  dayOverride: number | null;
}) {
  const [data, setData] = useState<ReviewRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const q =
      dayOverride != null ? `?day=${dayOverride}` : '';
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
        if (!cancelled) {
          setData(json);
          setRound(
            Math.max(
              1,
              json.resume?.round ?? (json.rounds_done ?? 0) + 1,
            ),
          );
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [dayOverride]);

  const roundSteps = useMemo(() => {
    if (!data) return [];
    return data.steps.filter((s) => s.round === round);
  }, [data, round]);

  const questions = useMemo(() => {
    return roundSteps
      .map((s, i) => stepToQuestion(s, i))
      .filter((q): q is Question => Boolean(q));
  }, [roundSteps]);

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
    return (
      <main className="flex flex-1 flex-col items-stretch justify-center gap-4 p-6">
        <p className="font-[family-name:var(--font-v2-arabic)] text-lg text-v2-ink">
          خلّص أول درس ونبدأ نراجع سوا
        </p>
        <Link
          href={
            data.current_day > 0
              ? `/day/${data.current_day}`
              : '/path'
          }
          className="rounded-full bg-v2-primary px-5 py-3 text-center font-[family-name:var(--font-v2-arabic)] text-v2-on-primary"
        >
          روح للدرس
        </Link>
      </main>
    );
  }

  if (ended || data.status === 'done') {
    const lines = data.window.map((w) => {
      const open = data.steps.filter(
        (s) =>
          s.lesson_day === w.day &&
          (!s.result || s.result.correct === false),
      ).length;
      return open === 0
        ? `Dia ${w.day} · اتراجع كله ✓`
        : `Dia ${w.day} · فاضل ${toArDigits(open)}`;
    });
    return (
      <SessionEnd
        day={data.current_day}
        stats={{
          correct: data.steps.filter((s) => s.result?.correct).length,
          total: data.steps.length,
          bySkill: {},
          usedCorrectly: [],
        }}
        titleOverride="خلصت مراجعة النهارده"
        extraLines={lines}
        onDoneHref="/path"
      />
    );
  }

  if (!questions.length) {
    return (
      <main className="flex flex-1 flex-col gap-4 p-4">
        <p className="font-[family-name:var(--font-v2-arabic)]">
          مفيش جولة {toArDigits(round)} جاهزة.
        </p>
        <Link href="/path">رجوع للمسار</Link>
      </main>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <p className="px-4 pt-3 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        جولة {toArDigits(round)} من {toArDigits(data.rounds_total)} · حوالي{' '}
        {toArDigits(data.budget_minutes)} دقايق
      </p>
      <QuestionSession
        day={data.current_day}
        questions={questions}
        items={[]}
        onComplete={() => {
          void postProgressEvent({
            kind: 'review_round_done',
            event_id: crypto.randomUUID(),
            target_lang: 'pt-PT',
            round,
          });
          if (round >= data.rounds_total) {
            setEnded(true);
          } else {
            setRound((r) => r + 1);
          }
        }}
      />
    </div>
  );
}
