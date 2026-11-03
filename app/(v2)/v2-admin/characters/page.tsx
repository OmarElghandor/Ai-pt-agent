'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type ImageRow = {
  key: string;
  status: string;
  url?: string | null;
  reason?: string | null;
  cost_usd?: number | null;
};

const CAST = [
  'yassin',
  'ines',
  'tiago',
  'rita',
  'carlos',
  'manuel',
  'sofia',
  'graca',
  'nour',
] as const;

export default function CharactersAdminPage() {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [styleAnchor, setStyleAnchor] = useState<ImageRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch('/api/v2/admin/images/characters');
    if (!res.ok) {
      setError(`load failed (${res.status})`);
      return;
    }
    const json = (await res.json()) as {
      characters: ImageRow[];
      style_anchor: ImageRow;
    };
    setRows(json.characters);
    setStyleAnchor(json.style_anchor);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/images/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function upload(id: string, file: File) {
    setBusy(id);
    setError(null);
    try {
      const form = new FormData();
      form.set('id', id);
      form.set('file', file);
      const res = await fetch('/api/v2/admin/images/characters', {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generateMissing() {
    setError(null);
    for (const id of CAST) {
      const row = rows.find((r) => r.key === `character.${id}`);
      if (row?.status === 'ready' && row.url) continue;
      await generate(id);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8" dir="rtl">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-500">
            <Link href="/v2-admin" className="underline">
              v2-admin
            </Link>
            {' · '}الشخصيات
          </p>
          <h1 className="mt-1 text-2xl font-semibold">شخصيات المرجع</h1>
          <p className="mt-1 text-sm text-neutral-600">
            تسعة شخصيات من characters.json — ولّد أو ارفع صور المرجع (جودة عالية).
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void generateMissing()}
          className="rounded-full bg-teal-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          ولّد الناقص
        </button>
      </header>

      {error ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAST.map((id) => {
          const row = rows.find((r) => r.key === `character.${id}`) ?? {
            key: `character.${id}`,
            status: 'missing',
          };
          return (
            <CharacterCard
              key={id}
              id={id}
              row={row}
              busy={busy === id}
              onGenerate={() => void generate(id)}
              onUpload={(f) => void upload(id, f)}
            />
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Style anchor</h2>
        <CharacterCard
          id="style_anchor"
          row={
            styleAnchor ?? {
              key: 'style_anchor',
              status: 'missing',
            }
          }
          busy={busy === 'style_anchor'}
          onGenerate={() => void generate('style_anchor')}
          onUpload={(f) => void upload('style_anchor', f)}
        />
      </section>
    </main>
  );
}

function CharacterCard(props: {
  id: string;
  row: ImageRow;
  busy: boolean;
  onGenerate: () => void;
  onUpload: (file: File) => void;
}) {
  const { id, row, busy, onGenerate, onUpload } = props;
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold capitalize">{id}</h3>
          <p className="text-xs text-neutral-500">{row.key}</p>
          <p className="mt-1 text-sm">
            status:{' '}
            <span className="font-medium">{row.status}</span>
            {row.reason ? ` · ${row.reason}` : ''}
          </p>
          {row.cost_usd != null ? (
            <p className="text-xs text-neutral-500">
              cost ${Number(row.cost_usd).toFixed(3)}
            </p>
          ) : null}
        </div>
        {row.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.url}
            alt={id}
            className="h-24 w-24 rounded-xl object-cover bg-neutral-100"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-400">
            لا صورة
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="rounded-full bg-teal-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {busy ? '…' : 'ولّد'}
        </button>
        <label className="cursor-pointer rounded-full border border-neutral-300 px-3 py-1.5 text-sm">
          ارفع
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </article>
  );
}
