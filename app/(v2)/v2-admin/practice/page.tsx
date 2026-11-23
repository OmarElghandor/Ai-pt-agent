'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type QRow = {
  id: string;
  type: string;
  skill: string;
  status: string;
  first_try_total: number;
  first_try_correct: number;
  percent: number | null;
  avg_time_ms: number;
  most_common_wrong: string | null;
  would_auto_flag: boolean;
};

export default function V2AdminPracticePage() {
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);

  async function load(flagged = false) {
    setError(null);
    const res = await fetch(
      `/api/v2/admin/practice/questions${flagged ? '?flagged=1' : ''}`,
    );
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as { questions: QRow[] };
    setQuestions(json.questions);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <main dir="ltr" className="flex flex-1 flex-col gap-4 pb-12">
      <h1 className="text-2xl font-semibold">Practice · level & questions</h1>
      <p className="text-sm opacity-80">
        Admin-only percentages and auto-flagged practice questions (16 §9.3).
        Learners never see these percents.
      </p>
      {error ? <p className="text-red-600">{error}</p> : null}

      <section className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 p-3">
        <label className="flex flex-col gap-1 text-sm">
          Learner user id
          <input
            className="min-w-[16rem] rounded border px-2 py-1 font-mono text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="v2 user id"
          />
        </label>
        <Link
          href={userId ? `/v2-admin/practice/learners/${encodeURIComponent(userId)}` : '#'}
          className="rounded bg-v2-primary px-3 py-1.5 text-sm text-white"
        >
          Open level
        </Link>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          disabled={rebuilding}
          onClick={() => {
            setRebuilding(true);
            void fetch('/api/v2/admin/practice/rebuild', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            })
              .then((r) => r.json())
              .then(() => load())
              .finally(() => setRebuilding(false));
          }}
        >
          {rebuilding ? 'Rebuilding…' : 'Rebuild all levels'}
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => void load(true)}
        >
          Flagged only
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => void load(false)}
        >
          All questions
        </button>
      </section>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th align="left">id</th>
            <th align="left">type</th>
            <th align="left">status</th>
            <th align="right">1st try</th>
            <th align="right">%</th>
            <th align="right">avg ms</th>
            <th align="left">wrong</th>
            <th align="left">actions</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id} className={q.would_auto_flag || q.status === 'flagged' ? 'bg-amber-50' : undefined}>
              <td className="max-w-[14rem] truncate font-mono" title={q.id}>
                {q.id}
              </td>
              <td>{q.type}</td>
              <td>{q.status}</td>
              <td align="right">
                {q.first_try_correct}/{q.first_try_total}
              </td>
              <td align="right">{q.percent == null ? '—' : `${q.percent}%`}</td>
              <td align="right">{q.avg_time_ms || '—'}</td>
              <td className="max-w-[8rem] truncate" title={q.most_common_wrong ?? ''}>
                {q.most_common_wrong ?? '—'}
              </td>
              <td>
                {q.status === 'flagged' ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void fetch('/api/v2/admin/practice/questions', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          question_id: q.id,
                          action: 'unflag',
                        }),
                      }).then(() => load());
                    }}
                  >
                    unflag
                  </button>
                ) : (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void fetch('/api/v2/admin/practice/questions', {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({
                          question_id: q.id,
                          action: 'rebuild',
                        }),
                      }).then(() => load());
                    }}
                  >
                    rebuild
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
