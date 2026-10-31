'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { QuestionCard } from '@/components/v2/blocks/QuestionCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { markPageDone } from '@/components/v2/player/session';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';

type PackPayload = {
  day: number;
  items: Item[];
  questions: Question[];
};

export default function DayQuestionsPage() {
  const params = useParams<{ day: string }>();
  const day = Number(params.day);
  const [data, setData] = useState<PackPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(day) || day < 1) return;
    void fetch(`/api/v2/lessons/${day}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const lesson = j?.lesson ?? j?.pack;
        if (!lesson) return;
        setData({
          day: j.day ?? day,
          items: lesson.items ?? [],
          questions: (lesson.questions ?? []).filter(
            (q: Question) => typeof q.page_index !== 'number' || q.page_index > 0,
          ),
        });
      })
      .catch(() => setData(null));
  }, [day]);

  useEffect(() => {
    if (finished && Number.isInteger(day)) {
      markPageDone(day, 'day_questions');
    }
  }, [finished, day]);

  const itemMap = useMemo(
    () => new Map((data?.items ?? []).map((i) => [i.id, i])),
    [data],
  );

  if (!Number.isInteger(day) || day < 1) {
    return <p className="p-4">يوم غلط</p>;
  }

  if (!data) {
    return (
      <main className="px-4 py-8">
        <Link href={`/day/${day}`} className="text-sm">
          رجوع
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">…</p>
      </main>
    );
  }

  const qs = data.questions;

  if (!qs.length) {
    return (
      <main className="px-4 py-8">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-xl">أسئلة اليوم</h1>
        <p className="mt-2 text-v2-ink-muted">مفيش أسئلة جاهزة.</p>
        <PrimaryButton
          className="mt-6"
          href={`/day/${day}`}
        >
          خريطة اليوم
        </PrimaryButton>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="px-4 py-8">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl text-v2-primary">
          خلّصت الأسئلة
        </h1>
        <PrimaryButton className="mt-6" href={`/day/${day}`}>
          خريطة اليوم
        </PrimaryButton>
      </main>
    );
  }

  const q = qs[index]!;

  return (
    <main className="flex min-h-dvh flex-col px-4 py-4">
      <Link href={`/day/${day}`} className="text-sm text-v2-ink">
        رجوع
      </Link>
      <p className="mt-2 font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
        سؤال {index + 1} من {qs.length}
      </p>
      <div className="mt-4 flex-1">
        <QuestionCard
          question={q}
          items={itemMap}
          onAnswer={() => {
            if (index + 1 >= qs.length) setFinished(true);
            else setIndex((i) => i + 1);
          }}
        />
      </div>
    </main>
  );
}
