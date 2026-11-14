'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Tab = 'official' | 'custom';

type OfficialDeck = {
  id: string;
  title_tl: string;
  title_ar: string;
  status: string;
  word_count: number;
  source_deck: string | null;
  missing_images: number;
  images_status: string;
};

type CustomDeck = {
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

function tabFromParam(v: string | null): Tab {
  return v === 'custom' ? 'custom' : 'official';
}

function AdminFlashcardsInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromParam(searchParams.get('tab')));
  const [official, setOfficial] = useState<OfficialDeck[]>([]);
  const [custom, setCustom] = useState<CustomDeck[]>([]);
  const [filter, setFilter] = useState('all');
  const [cost, setCost] = useState<{ jobs: number; quota_jobs: number } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTab(tabFromParam(searchParams.get('tab')));
  }, [searchParams]);

  const loadOfficial = useCallback(async () => {
    const res = await fetch('/api/v2/admin/official-decks');
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as { decks: OfficialDeck[] };
    setOfficial(json.decks);
    setError(null);
  }, []);

  const loadCustom = useCallback(async () => {
    const res = await fetch(
      `/api/v2/admin/custom-decks?filter=${encodeURIComponent(filter)}`,
    );
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as {
      decks: CustomDeck[];
      cost: { jobs: number; quota_jobs: number };
    };
    setCustom(json.decks);
    setCost(json.cost);
    setError(null);
  }, [filter]);

  useEffect(() => {
    if (tab === 'official') void loadOfficial();
    else void loadCustom();
  }, [tab, loadOfficial, loadCustom]);

  useEffect(() => {
    setSelected(new Set());
    setMessage(null);
  }, [tab, filter]);

  const rows = tab === 'official' ? official : custom;
  const allIds = useMemo(() => rows.map((d) => d.id), [rows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  }

  async function patchCustom(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/v2/admin/custom-decks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await loadCustom();
  }

  async function bulkImages(confirmOverCap = false) {
    const deck_ids = [...selected];
    if (!deck_ids.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const previewQs = new URLSearchParams({ kind: tab });
      for (const id of deck_ids) previewQs.append('deck_id', id);
      const previewRes = await fetch(
        `/api/v2/admin/flashcards/images/bulk?${previewQs}`,
      );
      if (!previewRes.ok) {
        setError(await previewRes.text());
        return;
      }
      const preview = (await previewRes.json()) as {
        missing_count: number;
        estimate_usd: number;
      };
      const ok = window.confirm(
        `ولّد الصور للمحددين؟\nناقص ${preview.missing_count} · تقدير ~$${preview.estimate_usd.toFixed(2)}\n(${deck_ids.length} ديك)`,
      );
      if (!ok) return;

      const res = await fetch('/api/v2/admin/flashcards/images/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: tab,
          deck_ids,
          confirm_over_cap: confirmOverCap,
        }),
      });
      if (res.status === 409) {
        const again = window.confirm('هنتجاوز الحد اليومي للصور. تأكيد؟');
        if (again) {
          setBusy(false);
          await bulkImages(true);
          return;
        }
        return;
      }
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as {
        totals: { enqueued: number; reused: number; missing_before: number };
      };
      setMessage(
        `اتعمل enqueue: ${json.totals.enqueued} · reused ${json.totals.reused} · كان ناقص ${json.totals.missing_before}`,
      );
      if (tab === 'official') await loadOfficial();
      else await loadCustom();
    } finally {
      setBusy(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url.toString());
  }

  return (
    <main dir="ltr" style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <p>
        <Link href="/v2-admin">← Admin</Link>
      </p>
      <h1>Flashcards</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => switchTab('official')}
          style={{
            fontWeight: tab === 'official' ? 700 : 400,
            textDecoration: tab === 'official' ? 'underline' : 'none',
          }}
        >
          رسمي (Official)
        </button>
        <button
          type="button"
          onClick={() => switchTab('custom')}
          style={{
            fontWeight: tab === 'custom' ? 700 : 400,
            textDecoration: tab === 'custom' ? 'underline' : 'none',
          }}
        >
          من المتعلمين (Custom)
        </button>
      </div>

      {tab === 'custom' && cost ? (
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Today: {cost.quota_jobs} quota generations · {cost.jobs} jobs total
        </p>
      ) : null}

      {tab === 'custom' ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {['all', 'reported', 'not_promoted', 'popular'].map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void bulkImages()}
        >
          ولّد الصور للمحددين ({selected.size})
        </button>
        {message ? <span style={{ fontSize: 13 }}>{message}</span> : null}
      </div>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {tab === 'official' ? (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">
                <input
                  type="checkbox"
                  checked={allIds.length > 0 && selected.size === allIds.length}
                  onChange={toggleAll}
                />
              </th>
              <th align="left">title</th>
              <th align="left">status</th>
              <th align="right">words</th>
              <th align="left">images</th>
              <th align="right">missing</th>
              <th align="left">actions</th>
            </tr>
          </thead>
          <tbody>
            {official.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
                <td style={{ padding: '6px 4px' }}>
                  {d.title_ar}
                  <br />
                  <span style={{ opacity: 0.7 }}>{d.title_tl}</span>
                </td>
                <td>{d.status}</td>
                <td align="right">{d.word_count}</td>
                <td>{d.images_status}</td>
                <td align="right">{d.missing_images}</td>
                <td style={{ padding: '6px 4px' }}>
                  {d.source_deck ? (
                    <Link href={`/v2-admin/custom-decks/${d.source_deck}/promote`}>
                      edit / promote
                    </Link>
                  ) : d.status === 'draft' ? (
                    <span style={{ opacity: 0.6 }}>draft</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">
                <input
                  type="checkbox"
                  checked={allIds.length > 0 && selected.size === allIds.length}
                  onChange={toggleAll}
                />
              </th>
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
            {custom.map((d) => (
              <tr key={d.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                  />
                </td>
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
                    onClick={() =>
                      void patchCustom(d.id, {
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
                    onClick={() => {
                      if (!window.confirm(`Delete «${d.title_ar}»?`)) return;
                      void patchCustom(d.id, { action: 'delete' });
                    }}
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
      )}
    </main>
  );
}

export default function AdminFlashcardsPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16 }}>Loading…</main>}>
      <AdminFlashcardsInner />
    </Suspense>
  );
}
