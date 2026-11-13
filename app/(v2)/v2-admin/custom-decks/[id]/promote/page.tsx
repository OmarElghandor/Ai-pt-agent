'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function PromoteCustomDeckPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [officialId, setOfficialId] = useState<string | null>(null);
  const [titleTl, setTitleTl] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(
        `/api/v2/admin/custom-decks/${params.id}/promote`,
        { method: 'POST' },
      );
      if (!res.ok) {
        setError(await res.text());
        return;
      }
      const json = (await res.json()) as { official_id: string };
      setOfficialId(json.official_id);
      const det = await fetch(
        `/api/v2/admin/official-decks/${json.official_id}`,
      );
      if (!det.ok) {
        setError(await det.text());
        return;
      }
      const deck = (await det.json()) as {
        title_tl: string;
        title_ar: string;
        item_ids: string[];
      };
      setTitleTl(deck.title_tl);
      setTitleAr(deck.title_ar);
      setItemIds(deck.item_ids);
    })();
  }, [params.id]);

  async function save() {
    if (!officialId) return;
    const res = await fetch(`/api/v2/admin/official-decks/${officialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        title_tl: titleTl,
        title_ar: titleAr,
        item_ids: itemIds,
      }),
    });
    setMsg(res.ok ? 'saved' : await res.text());
  }

  async function images() {
    if (!officialId) return;
    const res = await fetch(`/api/v2/admin/official-decks/${officialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'images' }),
    });
    setMsg(res.ok ? JSON.stringify(await res.json()) : await res.text());
  }

  async function publish() {
    if (!officialId) return;
    const res = await fetch(`/api/v2/admin/official-decks/${officialId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    });
    if (!res.ok) {
      setMsg(await res.text());
      return;
    }
    setMsg('published');
    router.push('/v2-admin/custom-decks');
  }

  return (
    <main dir="ltr" style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
      <p>
        <Link href="/v2-admin/custom-decks">← Decks</Link>
      </p>
      <h1>حوّله لديك رسمي</h1>
      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {officialId ? (
        <>
          <p>official draft: {officialId}</p>
          <label>
            title_tl
            <input
              value={titleTl}
              onChange={(e) => setTitleTl(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 8 }}
            />
          </label>
          <label>
            title_ar
            <input
              value={titleAr}
              onChange={(e) => setTitleAr(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 8 }}
            />
          </label>
          <p>items ({itemIds.length})</p>
          <ul>
            {itemIds.map((id) => (
              <li key={id}>
                {id}{' '}
                <button
                  type="button"
                  onClick={() =>
                    setItemIds((prev) => prev.filter((x) => x !== id))
                  }
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => void save()}>
              save draft
            </button>
            <button type="button" onClick={() => void images()}>
              enqueue images
            </button>
            <button type="button" onClick={() => void publish()}>
              publish
            </button>
          </div>
          {msg && <p>{msg}</p>}
        </>
      ) : (
        <p>creating draft…</p>
      )}
    </main>
  );
}
