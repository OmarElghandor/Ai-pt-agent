'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Report = {
  id: string;
  item_id: string | null;
  question_id: string | null;
  day: number;
  note: string;
  user_id: string | null;
  created_at: string | null;
};

export default function V2AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v2/admin/reports');
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as { reports: Report[] };
      setReports(json.reports);
    })();
  }, []);

  return (
    <main dir="ltr" className="flex flex-1 flex-col gap-3 pb-12">
      <h1 className="text-2xl font-semibold">Learner reports</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>
        From <code>POST /api/v2/reports</code> · collection <code>v2_reports</code>
      </p>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {!error && reports.length === 0 && (
        <p style={{ opacity: 0.7 }}>No reports yet.</p>
      )}
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">when</th>
            <th align="left">day</th>
            <th align="left">item</th>
            <th align="left">question</th>
            <th align="left">note</th>
            <th align="left">user</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '6px 4px', whiteSpace: 'nowrap' }}>
                {r.created_at
                  ? new Date(r.created_at).toLocaleString()
                  : '—'}
              </td>
              <td style={{ padding: '6px 4px' }}>
                <Link href={`/v2-admin/lessons/${r.day}`}>{r.day}</Link>
              </td>
              <td style={{ padding: '6px 4px', fontFamily: 'monospace' }}>
                {r.item_id ?? '—'}
              </td>
              <td style={{ padding: '6px 4px', fontFamily: 'monospace' }}>
                {r.question_id ?? '—'}
              </td>
              <td style={{ padding: '6px 4px' }}>{r.note}</td>
              <td style={{ padding: '6px 4px', opacity: 0.7 }}>
                {r.user_id ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
