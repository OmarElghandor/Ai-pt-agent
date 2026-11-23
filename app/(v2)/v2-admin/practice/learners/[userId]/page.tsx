'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type SkillRow = {
  skill: string;
  last_14: {
    first_try_correct: number;
    attempts: number;
    percent: number | null;
  };
  prev_14: {
    first_try_correct: number;
    attempts: number;
    percent: number | null;
  };
};

type Payload = {
  user: { id: string; name: string | null; email: string | null };
  answer_count: number;
  rebuilt_at: string | null;
  skills: SkillRow[];
  patterns: Record<string, unknown>;
  lessons: Record<string, unknown>;
  problem_ids: string[];
};

export default function V2AdminLearnerLevelPage() {
  const params = useParams<{ userId: string }>();
  const userId = decodeURIComponent(params.userId ?? '');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const res = await fetch(`/api/v2/admin/practice/level/${encodeURIComponent(userId)}`);
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      setData((await res.json()) as Payload);
    })();
  }, [userId]);

  return (
    <main dir="ltr" className="flex flex-1 flex-col gap-4 pb-12">
      <Link href="/v2-admin/practice" className="text-sm underline">
        ← Practice
      </Link>
      <h1 className="text-2xl font-semibold">Learner level</h1>
      {error ? <p className="text-red-600">{error}</p> : null}
      {!data ? (
        <p className="text-sm opacity-70">Loading…</p>
      ) : (
        <>
          <p className="text-sm">
            {data.user.name ?? '—'} · {data.user.email ?? '—'} ·{' '}
            <span className="font-mono">{data.user.id}</span>
          </p>
          <p className="text-sm opacity-80">
            {data.answer_count} answers · rebuilt{' '}
            {data.rebuilt_at ? new Date(data.rebuilt_at).toLocaleString() : '—'}
          </p>
          <table className="w-full max-w-xl border-collapse text-sm">
            <thead>
              <tr>
                <th align="left">skill</th>
                <th align="right">last 14</th>
                <th align="right">%</th>
                <th align="right">prev 14 %</th>
              </tr>
            </thead>
            <tbody>
              {data.skills.map((s) => (
                <tr key={s.skill}>
                  <td>{s.skill}</td>
                  <td align="right">
                    {s.last_14.first_try_correct}/{s.last_14.attempts}
                  </td>
                  <td align="right">
                    {s.last_14.percent == null ? '—' : `${s.last_14.percent}%`}
                  </td>
                  <td align="right">
                    {s.prev_14.percent == null ? '—' : `${s.prev_14.percent}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <section>
            <h2 className="text-base font-medium">Lessons coverage</h2>
            <pre className="overflow-auto rounded bg-black/5 p-2 text-xs">
              {JSON.stringify(data.lessons, null, 2)}
            </pre>
          </section>
          <section>
            <h2 className="text-base font-medium">Patterns</h2>
            <pre className="overflow-auto rounded bg-black/5 p-2 text-xs">
              {JSON.stringify(data.patterns, null, 2)}
            </pre>
          </section>
          <section>
            <h2 className="text-base font-medium">Open problems</h2>
            <p className="text-sm">{data.problem_ids.join(', ') || '—'}</p>
          </section>
        </>
      )}
    </main>
  );
}
