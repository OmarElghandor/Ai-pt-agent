'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { toArDigits } from '@/lib/v2/formatAr';
import {
  LEVEL_LABELS,
  groupByLevel,
  minLevel,
} from '@/lib/v2/micro/order';

type SeriesRow = {
  slug: string;
  order: number;
  title_ar: string;
  title_tl: string;
  clip_count: number;
  status: 'missing' | 'generating' | 'ready';
  id: string | null;
  finished_count: number;
  in_progress: boolean;
  official_deck_id: string | null;
  levels: number[];
  ready_clip_count: number;
  thumb_url?: string | null;
  sample_tls?: string[];
};

type FinishedClipRow = {
  id: string;
  slug: string;
  series_slug: string;
  series_order: number;
  series_title_ar: string;
  title_ar: string;
  title_tl: string;
  level: number;
  order: number;
  line_count: number;
  official_deck_id: string | null;
};

type Tab = 'all' | 'done';

function formatEnsureError(json: {
  error?: string;
  clip_errors?: Array<{ slug: string; reason: string; message: string }>;
}): string {
  if (json.clip_errors?.length) {
    const first = json.clip_errors[0]!;
    return `مش قادرين نجهّز اللقطات: ${json.error ?? first.reason} · ${first.slug}: ${first.message}`;
  }
  if (json.error) return `مش قادرين نجهّز اللقطات: ${json.error}`;
  return 'مش قادرين نجهّز اللقطات دلوقتي.';
}

export function MicroTopicsHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab: Tab =
    searchParams.get('tab') === 'done' ? 'done' : 'all';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [rows, setRows] = useState<SeriesRow[] | null>(null);
  const [finishedClips, setFinishedClips] = useState<FinishedClipRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/micro/series');
      const json = (await res.json()) as {
        all?: SeriesRow[];
        finished_clips?: FinishedClipRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setRows(json.all ?? []);
      setFinishedClips(json.finished_clips ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seriesGroups = useMemo(() => {
    if (!rows) return [];
    const withLevel = rows.map((r) => ({
      ...r,
      level: minLevel(r.levels),
    }));
    return groupByLevel(withLevel);
  }, [rows]);

  const finishedGroups = useMemo(
    () => groupByLevel(finishedClips),
    [finishedClips],
  );

  async function openSeries(row: SeriesRow) {
    if (ensuring) return;
    if (row.status === 'ready') {
      router.push(`/micro/${row.slug}`);
      return;
    }
    setEnsuring(row.slug);
    setError(null);
    try {
      const res = await fetch(`/api/v2/micro/series/${row.slug}/ensure`, {
        method: 'POST',
      });
      let json = (await res.json()) as {
        status?: string;
        error?: string;
        clip_errors?: Array<{ slug: string; reason: string; message: string }>;
      };

      let tries = 0;
      while (
        (json.status === 'generating' || res.status === 202) &&
        tries < 120
      ) {
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await fetch(`/api/v2/micro/series/${row.slug}/ensure`);
        json = (await poll.json()) as typeof json;
        if (json.status === 'ready') break;
        if (json.status === 'failed' || json.status === 'missing') {
          if (json.status === 'missing' && tries < 2) {
            const again = await fetch(
              `/api/v2/micro/series/${row.slug}/ensure`,
              { method: 'POST' },
            );
            json = (await again.json()) as typeof json;
          } else if (json.status === 'failed') {
            break;
          }
        }
        tries += 1;
      }

      if (json.status === 'ready') {
        router.push(`/micro/${row.slug}`);
        return;
      }
      setError(formatEnsureError(json));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnsuring(null);
    }
  }

  function selectTab(next: Tab) {
    setTab(next);
    const url = next === 'done' ? '/micro?tab=done' : '/micro';
    router.replace(url);
  }

  if (ensuring) {
    return <ScreenLoading label="بنجهّز اللقطات…" />;
  }

  if (error && !rows) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        {error}
      </p>
    );
  }

  if (!rows) {
    return <ScreenLoading label="بنحمّل…" />;
  }

  const readyCount = rows.filter((r) => r.status === 'ready').length;
  const finishedCount = finishedClips.length;
  const totalClips = rows.reduce((n, r) => n + r.clip_count, 0);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-4" dir="rtl">
      <header>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          لقطات
        </h1>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          أدوات يومية قصيرة — دوس على موضوع عشان تتفرج
        </p>
      </header>

      <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-[0_4px_16px_-2px_rgba(23,31,29,0.04)]">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container text-primary">
            <Icon name="photo_library" size={20} className="!text-[18px]" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-on-surface">
              {toArDigits(readyCount)} بوستر جاهز · {toArDigits(rows.length)} موضوع
            </span>
            <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-on-surface-variant">
              {toArDigits(finishedCount)} من {toArDigits(totalClips)} لقطة اتخلّصت
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-container p-1">
        <button
          type="button"
          onClick={() => selectTab('all')}
          className={`rounded-lg py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold ${
            tab === 'all'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant'
          }`}
        >
          كل اللقطات
        </button>
        <button
          type="button"
          onClick={() => selectTab('done')}
          className={`rounded-lg py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold ${
            tab === 'done'
              ? 'bg-surface-container-lowest text-on-surface shadow-sm'
              : 'text-on-surface-variant'
          }`}
        >
          اللي خلصتها
        </button>
      </div>

      {error ? (
        <p className="rounded-xl bg-error-container/40 px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-on-error-container">
          {error}
        </p>
      ) : null}

      {tab === 'all' ? (
        <div className="flex flex-col gap-5">
          {seriesGroups.map((group) => (
            <section key={group.level}>
              <h2 className="mb-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-4">
                {group.items.map((row) => (
                  <PosterCard
                    key={row.slug}
                    row={row}
                    onOpen={() => void openSeries(row)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : finishedClips.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low px-4 py-6 text-center font-[family-name:var(--font-v2-arabic)] text-sm text-on-surface-variant">
          لسه مخلصتش لقطات · ابدأ من كل اللقطات
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {finishedGroups.map((group) => (
            <section key={group.level}>
              <h2 className="mb-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
                {group.label}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((clip) => (
                  <li key={clip.id}>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/micro/${clip.series_slug}?clip=${encodeURIComponent(clip.slug)}&mode=review`,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface-container-lowest px-3 py-3 text-right shadow-[0_4px_16px_-2px_rgba(23,31,29,0.04)]"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-on-surface">
                          {clip.title_ar}
                        </div>
                        <div className="mt-0.5 truncate font-[family-name:var(--font-v2-arabic)] text-xs text-on-surface-variant">
                          {clip.series_title_ar}
                          {LEVEL_LABELS[clip.level]
                            ? ` · ${LEVEL_LABELS[clip.level]}`
                            : ''}
                        </div>
                      </div>
                      <span
                        dir="ltr"
                        className="shrink-0 font-[family-name:var(--font-v2-target)] text-xs font-semibold text-on-surface-variant"
                      >
                        {clip.title_tl}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PosterCard({
  row,
  onOpen,
}: {
  row: SeriesRow;
  onOpen: () => void;
}) {
  const level =
    row.levels.length > 0
      ? (LEVEL_LABELS[minLevel(row.levels)] ?? `L${minLevel(row.levels)}`)
      : '';
  const progress =
    row.status === 'ready'
      ? `${toArDigits(row.finished_count)} من ${toArDigits(row.clip_count)}`
      : row.status === 'generating'
        ? 'بيتجّهز…'
        : `${toArDigits(row.clip_count)} لقطة`;
  const cta = row.status === 'ready' ? 'اتفرج' : 'افتح';
  const samples =
    row.sample_tls && row.sample_tls.length > 0 ? row.sample_tls : null;

  return (
    <li className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_6px_20px_-4px_rgba(23,31,29,0.05)]">
      <div className="flex items-center justify-between bg-primary px-4 py-2.5 text-on-primary">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name="push_pin" size={20} className="shrink-0 text-on-primary" />
          <span
            dir="ltr"
            className="truncate font-[family-name:var(--font-v2-target)] text-sm font-bold tracking-wide"
          >
            {row.title_tl.toUpperCase()}
          </span>
        </div>
        {level ? (
          <span className="shrink-0 rounded bg-on-primary/15 px-2 py-0.5 text-[10px] font-bold">
            {level}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-v2-arabic)] text-lg font-semibold text-on-surface">
              {row.title_ar}
            </h3>
            <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-sm text-on-surface-variant">
              {progress}
              {row.status === 'missing' ? ' · لسه' : ''}
            </p>
          </div>
          {row.status === 'ready' && row.finished_count >= row.clip_count ? (
            <span className="flex shrink-0 items-center gap-1 rounded bg-secondary-container px-2 py-1 text-[10px] font-semibold text-on-secondary-container">
              <Icon name="check_circle" size={20} className="!text-[14px]" />
              خلّصتها
            </span>
          ) : null}
        </div>

        <div className="relative h-44 w-full overflow-hidden rounded-lg bg-surface-container">
          {row.thumb_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.thumb_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
              <Icon name="movie" size={32} />
            </div>
          )}
          <div className="absolute bottom-2 right-2 rounded bg-on-background/80 px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-background">
            {toArDigits(row.clip_count)} لقطات
          </div>
        </div>

        {samples ? (
          <div className="flex flex-wrap gap-1.5" dir="ltr">
            {samples.map((tl) => (
              <span
                key={tl}
                className="rounded-full bg-surface-container-low px-2.5 py-1 font-[family-name:var(--font-v2-target)] text-[11px] font-semibold text-on-surface-variant"
              >
                {tl}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-surface-container-low px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] font-semibold text-on-surface-variant">
              {toArDigits(row.clip_count)} لقطة
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onOpen}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-on-primary active:scale-[0.99]"
        >
          <Icon name="play_circle" size={20} />
          {cta}
        </button>
      </div>
    </li>
  );
}
