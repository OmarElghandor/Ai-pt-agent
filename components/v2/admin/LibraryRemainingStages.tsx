'use client';

import { useCallback, useEffect, useState } from 'react';

type Props = {
  slug: string;
  stages: Record<string, { status: string; stale?: boolean }>;
  onStagesChange?: () => void;
};

export default function LibraryRemainingStages({
  slug,
  stages,
  onStagesChange,
}: Props) {
  const [voicesCast, setVoicesCast] = useState<
    {
      voice_key: string;
      placeholder: boolean;
      approved: boolean;
      elevenlabs_voice_id: string | null;
    }[]
  >([]);
  const [audio, setAudio] = useState<{
    build_chars: number;
    monthly_left: number | null;
    lines: { line_index: number; ready: boolean; cost_chars: number }[];
  } | null>(null);
  const [images, setImages] = useState<{
    rows: { key: string; kind: string; status: string; url?: string | null; spec: string }[];
    estimate_usd_for_missing: number;
  } | null>(null);
  const [publish, setPublish] = useState<{
    ok: boolean;
    items: { id: string; label: string; ok: boolean }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, a, i, p] = await Promise.all([
      fetch(`/api/v2/admin/library/episodes/${slug}/voices-check`),
      fetch(`/api/v2/admin/library/episodes/${slug}/audio`),
      fetch(`/api/v2/admin/library/episodes/${slug}/images`),
      fetch(`/api/v2/admin/library/episodes/${slug}/publish`),
    ]);
    if (v.ok) {
      const j = await v.json();
      setVoicesCast(j.cast);
    }
    if (a.ok) setAudio(await a.json());
    if (i.ok) setImages(await i.json());
    if (p.ok) setPublish(await p.json());
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load, stages]);

  async function post(url: string, body: Record<string, unknown> = {}) {
    setError(null);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await load();
    onStagesChange?.();
  }

  return (
    <>
      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <section
        id="stage-voices"
        className="space-y-3 rounded-v2-card border border-v2-line bg-v2-card p-4"
      >
        <h2 className="text-lg font-medium text-v2-ink">٥. فحص الأصوات</h2>
        <p className="text-xs text-v2-ink-muted">
          الحالة: {stages.voices?.status}
          {' · '}
          <a href="/v2-admin/library/voices" className="text-v2-primary underline">
            صفحة الأصوات
          </a>
        </p>
        <ul className="space-y-1 text-sm">
          {voicesCast.map((c) => (
            <li key={c.voice_key} className={c.placeholder ? 'text-v2-attention' : ''}>
              {c.voice_key} · {c.approved ? 'معتمد' : 'مش معتمد'}
              {c.placeholder ? ' · <<placeholder>>' : ''}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-v2-chip border border-v2-line px-3 py-1 text-sm"
            onClick={() =>
              void post(`/api/v2/admin/library/episodes/${slug}/voices-check`, {
                action: 'assign_pools',
              })
            }
          >
            وزّع أصوات الـ pool
          </button>
          <button
            type="button"
            className="rounded-v2-chip bg-v2-action px-3 py-1 text-sm text-white"
            onClick={() =>
              void post(`/api/v2/admin/library/episodes/${slug}/voices-check`, {
                action: 'refresh',
              })
            }
          >
            حدّث الفحص
          </button>
        </div>
      </section>

      <section
        id="stage-audio"
        className="space-y-3 rounded-v2-card border border-v2-line bg-v2-card p-4"
      >
        <h2 className="text-lg font-medium text-v2-ink">٦. الصوت</h2>
        <p className="text-xs text-v2-ink-muted">الحالة: {stages.audio?.status}</p>
        {audio ? (
          <p className="text-sm">
            حروف للبناء: {audio.build_chars}
            {audio.monthly_left != null
              ? ` · باقي في الشهر: ${audio.monthly_left}`
              : ''}
          </p>
        ) : null}
        <button
          type="button"
          className="rounded-v2-chip border border-v2-line px-3 py-1 text-sm"
          onClick={() => void load()}
        >
          احسب التكلفة
        </button>
        <button
          type="button"
          className="ms-2 rounded-v2-chip bg-v2-action px-3 py-1 text-sm text-white"
          onClick={() =>
            void post(`/api/v2/admin/library/episodes/${slug}/audio`, {})
          }
        >
          ابني الصوت
        </button>
        {audio ? (
          <ul className="max-h-40 overflow-auto text-xs text-v2-ink-muted">
            {audio.lines.map((l) => (
              <li key={l.line_index}>
                سطر {l.line_index}: {l.ready ? 'جاهز' : `${l.cost_chars} حرف`}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        id="stage-images"
        className="space-y-3 rounded-v2-card border border-v2-line bg-v2-card p-4"
      >
        <h2 className="text-lg font-medium text-v2-ink">٧. الصور</h2>
        <p className="text-xs text-v2-ink-muted">
          تقدير الناقص: ${images?.estimate_usd_for_missing ?? '—'}
        </p>
        <ul className="space-y-2 text-sm">
          {(images?.rows ?? []).map((row) => (
            <li
              key={row.key}
              className="rounded-v2-row border border-v2-line bg-v2-paper p-2"
            >
              <p dir="ltr" className="text-start text-xs">
                {row.key} · {row.status}
              </p>
              <p className="text-xs text-v2-ink-muted">{row.spec.slice(0, 120)}…</p>
              {row.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.url} alt="" className="mt-1 max-h-24 rounded" />
              ) : (
                <button
                  type="button"
                  className="mt-1 text-v2-primary underline"
                  onClick={() =>
                    void post(`/api/v2/admin/library/episodes/${slug}/images`, {
                      key: row.key,
                      generate: true,
                    })
                  }
                >
                  ولّد / stub
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="stage-publish"
        className="space-y-3 rounded-v2-card border border-v2-line bg-v2-card p-4"
      >
        <h2 className="text-lg font-medium text-v2-ink">٨. النشر</h2>
        <ul className="space-y-1 text-sm">
          {(publish?.items ?? []).map((item) => (
            <li key={item.id}>
              {item.ok ? '✓' : '○'} {item.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={!publish?.ok}
          className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
          onClick={() =>
            void post(`/api/v2/admin/library/episodes/${slug}/publish`, {
              action: 'publish',
            })
          }
        >
          انشر
        </button>
        <button
          type="button"
          className="ms-2 rounded-v2-chip border border-v2-line px-4 py-2 text-sm"
          onClick={() =>
            void post(`/api/v2/admin/library/episodes/${slug}/publish`, {
              action: 'hide',
            })
          }
        >
          اخفي
        </button>
      </section>
    </>
  );
}
