'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { postProgressEvent } from '@/lib/v2/progress/clientEvent';

type Q = { id: string; type?: string; prompt?: unknown; tests?: string[] };

export default function ProblemPracticePage() {
  const params = useParams<{ problemId: string }>();
  const problemId = decodeURIComponent(params.problemId ?? '');
  const [questions, setQuestions] = useState<Q[]>([]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch(`/api/v2/gaps/${encodeURIComponent(problemId)}/practice`)
      .then((r) => r.json())
      .then((data: { questions?: Q[] }) => {
        setQuestions(data.questions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [problemId]);

  function next() {
    if (index + 1 >= questions.length) {
      setDone(true);
      postProgressEvent({
        kind: 'problem_session_finished',
        problem: problemId,
        questions_answered: questions.length,
      });
      return;
    }
    setIndex((i) => i + 1);
  }

  if (loading) {
    return <ScreenLoading label="بحمّل…" />;
  }

  if (done || !questions.length) {
    return (
      <main className="flex flex-col gap-4 px-4 py-8">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-xl font-bold">
          {questions.length ? 'خلّصت التمرين' : 'مفيش أسئلة جاهزة للمشكلة دي'}
        </h1>
        <Link href="/me/gaps" className="text-v2-action">
          رجوع لنواقصك
        </Link>
      </main>
    );
  }

  const q = questions[index]!;

  return (
    <main className="flex flex-col gap-4 px-4 py-8">
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        سؤال {index + 1} من {questions.length}
      </p>
      <h1 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
        تمرين · {problemId}
      </h1>
      <pre
        className="overflow-auto rounded-v2-card bg-v2-card p-3 text-xs"
        dir="ltr"
      >
        {JSON.stringify(q.prompt ?? q, null, 2)}
      </pre>
      <button
        type="button"
        onClick={next}
        className="rounded-full bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-white"
      >
        اللي بعده
      </button>
    </main>
  );
}
