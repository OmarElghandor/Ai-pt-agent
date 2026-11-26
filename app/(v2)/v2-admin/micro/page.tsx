'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

type OutlineClipRow = {
  slug: string;
  order: number;
  layout: string;
  level: number;
  title_ar: string;
  title_tl: string;
  legacy_ref: string | null;
  ready: boolean;
};

type OutlineSeriesRow = {
  slug: string;
  order: number;
  title_ar: string;
  title_tl: string;
  clip_count: number;
  clips: OutlineClipRow[];
};

type DbClip = {
  id: string;
  slug: string;
  order: number;
  layout: string;
  level: number;
  title_ar: string;
  title_tl: string;
  status: string;
  line_count: number;
  generation_tokens: number;
  main_image_key: string | null;
};

type DbSeries = {
  id: string;
  slug: string;
  title_ar: string;
  title_tl: string;
  order: number;
  status: string;
  official_deck_id: string | null;
  clips: DbClip[];
};

const LEVEL_LABELS = ['', 'سهل جداً', 'سهل', 'متوسط', 'أصعب شوية', 'صعب'];

export default function MicroAdminPage() {
  const [tab, setTab] = useState<'outline' | 'generated'>('generated');
  const [outline, setOutline] = useState<OutlineSeriesRow[] | null>(null);
  const [db, setDb] = useState<DbSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadOutline = useCallback(async () => {
    const res = await fetch('/api/v2/admin/micro/outline');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    setOutline(json.series ?? []);
  }, []);

  const loadDb = useCallback(async () => {
    const res = await fetch('/api/v2/admin/micro/series');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    setDb(json.series ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([loadOutline(), loadDb()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadOutline, loadDb]);

  async function generateClip(seriesSlug: string, clipSlug: string) {
    setBusy(`${seriesSlug}/${clipSlug}`);
    setMsg(null);
    try {
      const res = await fetch('/api/v2/admin/micro/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_slug: seriesSlug, clip_slug: clipSlug }),
      });
      const json = await res.json();
      setMsg(
        json.ok
          ? `اتولدت: ${clipSlug}`
          : `فشل ${clipSlug}: ${json.reason ?? json.error ?? res.status}`,
      );
      await loadDb();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function bulkGenerate(seriesSlug: string) {
    setBusy(`bulk:${seriesSlug}`);
    setMsg(null);
    try {
      const res = await fetch('/api/v2/admin/micro/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bulk_series: seriesSlug }),
      });
      const json = await res.json();
      const ok = (json.results ?? []).filter((r: { ok?: boolean }) => r.ok).length;
      setMsg(`سلسلة ${seriesSlug}: ${ok}/${json.results?.length ?? 0} اتولدوا`);
      await loadDb();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function publishSeries(seriesId: string) {
    setBusy(`publish:${seriesId}`);
    setMsg(null);
    try {
      const res = await fetch('/api/v2/admin/micro/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId }),
      });
      const json = await res.json();
      setMsg(json.ok ? 'اتنشرت السلسلة' : `فشل النشر: ${json.reason}`);
      await loadDb();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function publishClip(clipId: string) {
    setBusy(`pubclip:${clipId}`);
    setMsg(null);
    try {
      const res = await fetch('/api/v2/admin/micro/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId }),
      });
      const json = await res.json();
      setMsg(json.ok ? 'اتنشرت اللقطة' : `فشل: ${json.reason}`);
      await loadDb();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function enqueueImages(seriesId: string) {
    setBusy(`img:${seriesId}`);
    setMsg(null);
    try {
      const res = await fetch(`/api/v2/admin/micro/series/${seriesId}/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setMsg(
        json.ok
          ? `صور: enqueued ${json.enqueued}, reused ${json.reused}${json.skipped ? ' (GENERATE_IMAGES off)' : ''}`
          : `فشل الصور: ${json.error}`,
      );
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function exportReel(clipId: string) {
    setBusy(`reel:${clipId}`);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/v2/admin/micro/clips/${clipId}/export-reel`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!res.ok) {
        setMsg(`تصدير: ${json.error ?? res.status}`);
      } else {
        setMsg(`كريل جاهز · ${json.layout} · ${json.lines?.length ?? 0} سطور`);
        console.info('micro reel export', json);
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6" dir="rtl">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">لقطات</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            توليد · صور · نشر · تصدير كريل
          </p>
        </div>
        <Link
          href="/v2-admin"
          className="text-sm text-primary underline-offset-2 hover:underline"
        >
          رجوع
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === 'generated'
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container'
          }`}
          onClick={() => setTab('generated')}
        >
          المتولّد
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${
            tab === 'outline'
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container'
          }`}
          onClick={() => setTab('outline')}
        >
          الـ Outline
        </button>
      </div>

      {error ? (
        <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="mb-3 rounded-lg bg-surface-container px-3 py-2 text-sm">
          {msg}
        </p>
      ) : null}
      {busy ? (
        <p className="mb-3 text-sm text-on-surface-variant">شغال: {busy}</p>
      ) : null}

      {tab === 'outline' ? (
        !outline ? (
          <p className="text-sm text-on-surface-variant">بيحمّل…</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {outline.map((s) => {
              const isOpen = open === s.slug;
              return (
                <li
                  key={s.slug}
                  className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest"
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
                    onClick={() => setOpen(isOpen ? null : s.slug)}
                  >
                    <div>
                      <div className="font-medium text-on-surface">
                        {s.order}. {s.title_ar}
                      </div>
                      <div className="text-xs text-on-surface-variant" dir="ltr">
                        {s.title_tl} · {s.clip_count} clips
                      </div>
                    </div>
                    <span>{isOpen ? '▾' : '◂'}</span>
                  </button>
                  {isOpen ? (
                    <>
                      <div className="border-t border-outline-variant/30 px-3 py-2">
                        <button
                          type="button"
                          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-on-primary"
                          disabled={Boolean(busy)}
                          onClick={() => void bulkGenerate(s.slug)}
                        >
                          ولّد كل السلسلة
                        </button>
                      </div>
                      <ul className="px-2 py-2">
                        {s.clips.map((c) => (
                          <li
                            key={c.slug}
                            className="flex items-start justify-between gap-2 rounded-lg px-2 py-2 text-sm"
                          >
                            <div>
                              <div>
                                {c.order}. {c.title_ar}
                              </div>
                              <div
                                className="text-xs text-on-surface-variant"
                                dir="ltr"
                              >
                                {c.layout} ·{' '}
                                {LEVEL_LABELS[c.level] ?? `L${c.level}`}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="rounded bg-surface-container px-2 py-1 text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => void generateClip(s.slug, c.slug)}
                            >
                              ولّد
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : !db ? (
        <p className="text-sm text-on-surface-variant">بيحمّل…</p>
      ) : db.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          لسه مفيش سلاسل متولّدة — روّح للـ Outline وولّد.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {db.map((s) => {
            const isOpen = open === `db:${s.slug}`;
            return (
              <li
                key={s.id}
                className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
                  onClick={() => setOpen(isOpen ? null : `db:${s.slug}`)}
                >
                  <div>
                    <div className="font-medium text-on-surface">
                      {s.order}. {s.title_ar}{' '}
                      <span className="text-xs text-on-surface-variant">
                        ({s.status})
                      </span>
                    </div>
                    <div className="text-xs text-on-surface-variant" dir="ltr">
                      {s.title_tl} · {s.clips.length} clips
                      {s.official_deck_id
                        ? ` · deck ${s.official_deck_id.slice(0, 8)}`
                        : ''}
                    </div>
                  </div>
                  <span>{isOpen ? '▾' : '◂'}</span>
                </button>
                {isOpen ? (
                  <>
                    <div className="flex flex-wrap gap-2 border-t border-outline-variant/30 px-3 py-2">
                      <button
                        type="button"
                        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-on-primary"
                        disabled={Boolean(busy)}
                        onClick={() => void bulkGenerate(s.slug)}
                      >
                        ولّد تاني
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-surface-container px-3 py-1.5 text-sm"
                        disabled={Boolean(busy)}
                        onClick={() => void publishSeries(s.id)}
                      >
                        نشر السلسلة
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-surface-container px-3 py-1.5 text-sm"
                        disabled={Boolean(busy)}
                        onClick={() => void enqueueImages(s.id)}
                      >
                        ولّد الصور
                      </button>
                    </div>
                    <ul className="px-2 py-2">
                      {s.clips.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-start justify-between gap-2 rounded-lg px-2 py-2 text-sm"
                        >
                          <div>
                            <div>
                              {c.order}. {c.title_ar}
                            </div>
                            <div
                              className="text-xs text-on-surface-variant"
                              dir="ltr"
                            >
                              {c.status} · {c.layout} · {c.line_count} lines ·{' '}
                              {c.generation_tokens} tok
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              className="rounded bg-surface-container px-2 py-1 text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => void generateClip(s.slug, c.slug)}
                            >
                              ولّد تاني
                            </button>
                            <button
                              type="button"
                              className="rounded bg-surface-container px-2 py-1 text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => void publishClip(c.id)}
                            >
                              نشر
                            </button>
                            <button
                              type="button"
                              className="rounded bg-surface-container px-2 py-1 text-xs"
                              disabled={Boolean(busy) || c.status !== 'published'}
                              onClick={() => void exportReel(c.id)}
                            >
                              صدّر كريل
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
