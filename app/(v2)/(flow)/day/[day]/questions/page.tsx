'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { QuestionSession } from '@/components/v2/questions/QuestionSession';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { markPageDone } from '@/components/v2/player/session';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';

function forDaySession(questions: Question[]): Question[] {
  return questions.filter((q) => {
    const u = (q as { use?: string }).use;
    return u !== 'practice';
  });
}

type PackPayload = {
  day: number;
  items: Item[];
  questions: Question[];
};

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; data: PackPayload };

export default function DayQuestionsPage() {
  const params = useParams<{ day: string }>();
  const day = Number(params.day);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!Number.isInteger(day) || day < 1) return;
    setState({ status: 'loading' });
    void fetch(`/api/v2/lessons/${day}`)
      .then(async (r) => {
        if (!r.ok) {
          setState({ status: 'missing' });
          return;
        }
        const j = await r.json();
        const lesson = j?.lesson ?? j?.pack;
        if (!lesson) {
          setState({ status: 'missing' });
          return;
        }
        const all = (lesson.questions ?? []) as Question[];
        setState({
          status: 'ready',
          data: {
            day: j.day ?? day,
            items: lesson.items ?? [],
            questions: forDaySession(all),
          },
        });
      })
      .catch(() => setState({ status: 'missing' }));
  }, [day]);

  if (!Number.isInteger(day) || day < 1) {
    return <p className="p-4">يوم غلط</p>;
  }

  if (state.status === 'loading') {
    return <ScreenLoading fullScreen label="بنجهّز الأسئلة…" />;
  }

  if (state.status === 'missing') {
    return (
      <main className="mx-auto max-w-[390px] px-4 py-8">
        <Link href={`/day/${day}`} className="text-sm text-v2-ink">
          رجوع
        </Link>
        <h1 className="mt-4 font-[family-name:var(--font-v2-arabic)] text-xl text-v2-primary">
          أسئلة اليوم
        </h1>
        <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
          الدرس مش متاح دلوقتي.
        </p>
        <PrimaryButton className="mt-6" href={`/day/${day}`}>
          خريطة اليوم
        </PrimaryButton>
      </main>
    );
  }

  const { data } = state;

  if (!data.questions.length) {
    return (
      <main className="mx-auto max-w-[390px] px-4 py-8">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-xl text-v2-primary">
          أسئلة اليوم
        </h1>
        <p className="mt-2 text-v2-ink-muted">مفيش أسئلة جاهزة.</p>
        <PrimaryButton className="mt-6" href={`/day/${day}`}>
          خريطة اليوم
        </PrimaryButton>
      </main>
    );
  }

  return (
    <QuestionSession
      day={day}
      questions={data.questions}
      items={data.items}
      onComplete={() => markPageDone(day, 'day_questions')}
    />
  );
}
