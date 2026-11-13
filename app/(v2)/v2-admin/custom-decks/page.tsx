'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type Deck = {
  id: string;
  title_tl: string;
  title_ar: string;
  visibility: string;
  status: string;
  report_count: number;
  added_count: number;
  images_status?: string;
  word_count: number;
};

export default function AdminCustomDecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [filter, setFilter] = useState('all');
  const [cost, setCost] = useState<{ jobs: number; quota_jobs: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/v2/admin/custom-decks?filter=${encodeURIComponent(filter)}`,
    );
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as {
      decks: Deck[];
      cost: { jobs: number; quota_jobs: number };
    };
    setDecks(json.decks);
    setCost(json.cost);
    setError(null);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/v2/admin/custom-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await load();
  }

  async function generateImages(id: string, confirmOverCap = false) {
    const preview = await fetch(`/api/v2/admin/custom-decks/${id}/images`);
    if (!preview.ok) {
      setError(await preview.text());
      return;
    }
    const plan = (await preview.json()) as {
      missing_count: number;
      estimate_usd: number;
    };
    const ok = window.confirm(
      `ولّد الصور؟ ناقص ${plan.missing_count} · تقدير ~$${plan.estimate_usd.toFixed(2)}`,
    );
    if (!ok) return;
    const res = await fetch(`/api/v2/admin/custom-decks/${id}/images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_over_cap: confirmOverCap }),
    });
    if (res.status === 409) {
      const again = window.confirm(
        'هنتجاوز الحد اليومي للصور. تأكيد؟',
      );
      if (again) await generateImages(id, true);
      return;
    }
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await load();
  }

  return (
    <main dir="ltr" style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <p>
        <Link href="/v2-admin">← Admin</Link>
      </p>
      <h1>ديكات المتعلمين</h1>
      {cost ? (
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Today: {cost.quota_jobs} quota generations · {cost.jobs} jobs total
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['all', 'reported', 'not_promoted', 'popular'].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">title</th>
            <th align="left">vis</th>
            <th align="left">status</th>
            <th align="right">added</th>
            <th align="right">reports</th>
            <th align="left">images</th>
            <th align="right">words</th>
            <th align="left">actions</th>
          </tr>
        </thead>
        <tbody>
          {decks.map((d) => (
            <tr key={d.id} style={{ borderTop: '1px solid #e5e7eb' }}>
              <td style={{ padding: '6px 4px' }}>
                {d.title_ar}
                <br />
                <span style={{ opacity: 0.7 }}>{d.title_tl}</span>
              </td>
              <td>{d.visibility}</td>
              <td>{d.status}</td>
              <td align="right">{d.added_count}</td>
              <td align="right">{d.report_count}</td>
              <td>{d.images_status ?? 'none'}</td>
              <td align="right">{d.word_count}</td>
              <td style={{ padding: '6px 4px' }}>
                <button
                  type="button"
                  onClick={() => void generateImages(d.id)}
                >
                  ولّد الصور
                </button>{' '}
                <button
                  type="button"
                  onClick={() =>
                    void patch(d.id, {
                      action: 'visibility',
                      visibility:
                        d.visibility === 'hidden' ? 'public' : 'hidden',
                    })
                  }
                >
                  {d.visibility === 'hidden' ? 'unhide' : 'hide'}
                </button>{' '}
                <button
                  type="button"
                  onClick={() => void patch(d.id, { action: 'delete' })}
                >
                  delete
                </button>{' '}
                {d.status === 'custom' ? (
                  <Link href={`/v2-admin/custom-decks/${d.id}/promote`}>
                    promote
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
