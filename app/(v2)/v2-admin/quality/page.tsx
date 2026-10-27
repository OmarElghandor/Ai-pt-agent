'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Run = {
  id: string;
  profile: string;
  started_at: string;
  finished_at?: string;
  issues_by_rule: Record<string, number>;
  tokens_by_kind?: Record<string, { in?: number; out?: number }>;
  time_by_kind?: Record<string, number>;
  cost_by_kind?: Record<string, number>;
  over_budget_count: number;
  summary?: { days?: number; flagged?: number; failed?: number };
  delta_vs_previous: {
    issues_by_rule: Record<string, number>;
    over_budget: number;
  } | null;
};

function Delta({ n }: { n: number }) {
  if (n === 0) return <span style={{ opacity: 0.5 }}>0</span>;
  // Lower issue counts are better → green when negative
  const better = n < 0;
  return (
    <span style={{ color: better ? '#16a34a' : '#dc2626' }}>
      {n > 0 ? `+${n}` : n}
    </span>
  );
}

export default function V2AdminQualityPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v2/admin/quality');
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as { runs: Run[] };
      setRuns(json.runs);
    })();
  }, []);

  const ruleKeys = [
    ...new Set(runs.flatMap((r) => Object.keys(r.issues_by_rule ?? {}))),
  ].sort();
  const kindKeys = [
    ...new Set(
      runs.flatMap((r) => Object.keys(r.tokens_by_kind ?? {})),
    ),
  ].sort();

  const byProfile = new Map<string, Run[]>();
  for (const r of runs) {
    const list = byProfile.get(r.profile) ?? [];
    list.push(r);
    byProfile.set(r.profile, list);
  }

  return (
    <main dir="ltr" style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <p>
        <Link href="/v2-admin">← Admin</Link>
      </p>
      <h1>Quality · gen-sample runs</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>
        Persisted from <code>npm run v2:gen-sample -- --profile …</code>. Green
        deltas = fewer issues / less over-budget vs previous run.
      </p>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {byProfile.size > 1 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16 }}>Profiles side by side (latest each)</h2>
          <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th align="left">profile</th>
                <th align="right">over_budget</th>
                <th align="right">flagged</th>
                {ruleKeys.slice(0, 8).map((k) => (
                  <th key={k} align="right">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byProfile.entries()].map(([profile, list]) => {
                const latest = list[0]!;
                return (
                  <tr key={profile}>
                    <td>{profile}</td>
                    <td align="right">{latest.over_budget_count}</td>
                    <td align="right">{latest.summary?.flagged ?? '—'}</td>
                    {ruleKeys.slice(0, 8).map((k) => (
                      <td key={k} align="right">
                        {latest.issues_by_rule[k] ?? 0}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th align="left">when</th>
            <th align="left">profile</th>
            <th align="right">over</th>
            <th align="right">Δ over</th>
            {ruleKeys.slice(0, 6).map((k) => (
              <th key={k} align="right">
                {k}
              </th>
            ))}
            {kindKeys.slice(0, 4).map((k) => (
              <th key={k} align="right">
                {k} ms
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.started_at).toLocaleString()}</td>
              <td>{r.profile}</td>
              <td align="right">{r.over_budget_count}</td>
              <td align="right">
                {r.delta_vs_previous ? (
                  <Delta n={r.delta_vs_previous.over_budget} />
                ) : (
                  '—'
                )}
              </td>
              {ruleKeys.slice(0, 6).map((k) => {
                const n = r.issues_by_rule[k] ?? 0;
                const d = r.delta_vs_previous?.issues_by_rule[k];
                return (
                  <td key={k} align="right">
                    {n}
                    {d != null && d !== 0 ? (
                      <>
                        {' '}
                        (<Delta n={d} />)
                      </>
                    ) : null}
                  </td>
                );
              })}
              {kindKeys.slice(0, 4).map((k) => (
                <td key={k} align="right">
                  {r.time_by_kind?.[k] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {runs.length === 0 && !error && (
        <p>No runs yet. Run <code>npm run v2:gen-sample</code>.</p>
      )}
    </main>
  );
}
