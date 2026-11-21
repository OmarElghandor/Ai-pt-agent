'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type BankMoment = {
  id: string;
  place: string;
  eg: string;
  must_say: string;
  archived: boolean;
  used_in: number;
};

const inputClass =
  'w-full rounded-v2-row border border-v2-line bg-v2-card px-3 py-2 text-sm text-v2-ink';
const smallBtn =
  'rounded-v2-row border border-v2-line px-3 py-1 text-sm disabled:opacity-40';

export default function LibraryMomentsPage() {
  const [moments, setMoments] = useState<BankMoment[]>([]);
  const [place, setPlace] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; eg: string; must_say: string } | null>(
    null,
  );
  const [adding, setAdding] = useState<{ eg: string; must_say: string } | null>(null);
  const [newPlace, setNewPlace] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v2/admin/library/moments?archived=1');
    if (!res.ok) {
      setError(`تعذر التحميل (${res.status})`);
      return;
    }
    setMoments(((await res.json()) as { moments: BankMoment[] }).moments);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v2/admin/library/moments?archived=1');
      if (!res.ok) {
        setError(`تعذر التحميل (${res.status})`);
        return;
      }
      setMoments(((await res.json()) as { moments: BankMoment[] }).moments);
    })();
  }, []);

  const places = useMemo(() => [...new Set(moments.map((m) => m.place))].sort(), [moments]);
  const activePlace = place || places[0] || '';
  const rows = moments.filter(
    (m) => m.place === activePlace && (showArchived || !m.archived),
  );

  async function send(url: string, method: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `تعذر الحفظ (${res.status})`);
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function add() {
    const target = newPlace.trim() || activePlace;
    if (!adding || !target) return;
    if (await send('/api/v2/admin/library/moments', 'POST', { place: target, eg: adding.eg, must_say: adding.must_say }, 'add')) {
      setAdding(null);
      setNewPlace('');
      setPlace(target.toLowerCase());
    }
  }

  async function saveEdit() {
    if (!editing) return;
    if (
      await send(
        `/api/v2/admin/library/moments/${editing.id}`,
        'PATCH',
        { eg: editing.eg, must_say: editing.must_say },
        editing.id,
      )
    ) {
      setEditing(null);
    }
  }

  return (
    <main
      dir="rtl"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto pb-12 font-[family-name:var(--font-v2-arabic)]"
    >
      <p className="text-sm text-v2-ink-muted">
        <Link href="/v2-admin/library" className="underline">
          المكتبة
        </Link>
        {' · '}بنك اللحظات
      </p>
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
        بنك اللحظات
      </h1>
      <p className="text-sm text-v2-ink-muted">
        اللحظات الصغيرة اللي بتحصل في كل مكان. اللحظة المأرشفة بتفضل في الـ briefs اللي بتستخدمها.
      </p>

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm text-v2-ink">
          {error}
        </p>
      ) : null}

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {places.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === activePlace}
            onClick={() => setPlace(p)}
            dir="ltr"
            className={`rounded-v2-chip border px-3 py-1 text-sm ${
              p === activePlace
                ? 'border-transparent bg-v2-primary-tint text-v2-primary'
                : 'border-v2-line bg-v2-card text-v2-ink-muted'
            }`}
          >
            {p} ({moments.filter((m) => m.place === p && !m.archived).length})
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-v2-ink">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        اعرض المأرشف
      </label>

      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-v2-ink-muted">مفيش لحظات في المكان ده.</li>
        ) : null}
        {rows.map((m) => (
          <li
            key={m.id}
            className={`space-y-2 rounded-v2-card border border-v2-line bg-v2-card p-3 ${
              m.archived ? 'opacity-60' : ''
            }`}
          >
            {editing?.id === m.id ? (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={editing.eg}
                  onChange={(e) => setEditing({ ...editing, eg: e.target.value })}
                  className={inputClass}
                />
                <input
                  dir="ltr"
                  value={editing.must_say}
                  placeholder="must_say (اختياري)"
                  onChange={(e) => setEditing({ ...editing, must_say: e.target.value })}
                  className={`${inputClass} font-[family-name:var(--font-v2-target)]`}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void saveEdit()}
                    className="rounded-v2-chip bg-v2-action px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    حفظ
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className={smallBtn}>
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-v2-ink">{m.eg}</p>
                {m.must_say ? (
                  <p
                    dir="ltr"
                    className="text-start text-sm text-v2-ink-muted font-[family-name:var(--font-v2-target)]"
                  >
                    {m.must_say}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-v2-ink-muted">
                    مستخدمة في {m.used_in.toLocaleString('ar-EG')} حلقة
                    {m.archived ? ' · مأرشفة' : ''}
                  </span>
                  <span className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setEditing({ id: m.id, eg: m.eg, must_say: m.must_say })}
                    className={smallBtn}
                  >
                    عدّل
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void send(
                        `/api/v2/admin/library/moments/${m.id}`,
                        'PATCH',
                        { archived: !m.archived },
                        m.id,
                      )
                    }
                    className={smallBtn}
                  >
                    {m.archived ? 'رجّعها' : 'أرشف'}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="space-y-2 rounded-v2-card border border-v2-line bg-v2-card p-3">
          <input
            dir="ltr"
            value={newPlace}
            placeholder={`المكان (الافتراضي: ${activePlace || '—'})`}
            onChange={(e) => setNewPlace(e.target.value)}
            className={inputClass}
          />
          <textarea
            rows={2}
            value={adding.eg}
            placeholder="وصف اللحظة بالمصري"
            onChange={(e) => setAdding({ ...adding, eg: e.target.value })}
            className={inputClass}
          />
          <input
            dir="ltr"
            value={adding.must_say}
            placeholder="must_say (اختياري)"
            onChange={(e) => setAdding({ ...adding, must_say: e.target.value })}
            className={`${inputClass} font-[family-name:var(--font-v2-target)]`}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null || !adding.eg.trim()}
              onClick={() => void add()}
              className="rounded-v2-chip bg-v2-action px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              ضيف
            </button>
            <button type="button" onClick={() => setAdding(null)} className={smallBtn}>
              إلغاء
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding({ eg: '', must_say: '' })}
          className="self-start rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white"
        >
          + لحظة جديدة
        </button>
      )}
    </main>
  );
}
