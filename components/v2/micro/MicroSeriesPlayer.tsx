'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipSheet, type ClipView } from '@/components/v2/micro/ClipSheet';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import { compareClipsByLevelThenOrder } from '@/lib/v2/micro/order';

type SeriesPayload = {
  series: {
    slug: string;
    title_ar?: string;
    title_tl?: string;
    order?: number;
    official_deck_id: string | null;
  };
  clips: Array<
    ClipView & {
      slug: string;
      order?: number;
      revealed_count: number;
      finished: boolean;
    }
  >;
};

type FinishedClipRow = {
  id: string;
  slug: string;
  series_slug: string;
  series_order: number;
  level: number;
  order: number;
};

export function MicroSeriesPlayer() {
  const params = useParams<{ seriesSlug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const clipSlug = searchParams.get('clip');
  const reviewMode = searchParams.get('mode') === 'review';
  const [data, setData] = useState<SeriesPayload | null>(null);
  const [finishedClips, setFinishedClips] = useState<FinishedClipRow[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const reviewedSent = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [seriesRes, listRes] = await Promise.all([
          fetch(`/api/v2/micro/series/${params.seriesSlug}`),
          reviewMode ? fetch('/api/v2/micro/series') : Promise.resolve(null),
        ]);
        const json = await seriesRes.json();
        if (!seriesRes.ok) {
          if (!cancelled) setError(json.error ?? 'error');
          return;
        }
        if (!cancelled) {
          const clips = (json.clips as SeriesPayload['clips'])
            .slice()
            .sort((a, b) =>
              a.level !== b.level
                ? a.level - b.level
                : (a.order ?? 0) - (b.order ?? 0),
            );
          setData({ ...json, clips });
          if (clipSlug) {
            const at = clips.findIndex((c) => c.slug === clipSlug);
            setIndex(at >= 0 ? at : 0);
          } else if (!reviewMode) {
            const firstUnfinished = clips.findIndex((c) => !c.finished);
            setIndex(firstUnfinished >= 0 ? firstUnfinished : 0);
          } else {
            setIndex(0);
          }
        }
        if (listRes && listRes.ok) {
          const listJson = (await listRes.json()) as {
            finished_clips?: FinishedClipRow[];
          };
          if (!cancelled) {
            setFinishedClips(
              (listJson.finished_clips ?? []).slice().sort((a, b) =>
                compareClipsByLevelThenOrder(
                  {
                    level: a.level,
                    series_order: a.series_order,
                    order: a.order,
                  },
                  {
                    level: b.level,
                    series_order: b.series_order,
                    order: b.order,
                  },
                ),
              ),
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.seriesSlug, clipSlug, reviewMode]);

  const clip = data?.clips[index];

  useEffect(() => {
    if (!clip || reviewMode) return;
    void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
  }, [clip?.id, reviewMode]);

  const nextReviewHref = useMemo(() => {
    if (!clip || !finishedClips.length) return '/micro?tab=done';
    const at = finishedClips.findIndex((c) => c.id === clip.id);
    const next =
      at >= 0
        ? finishedClips[at + 1]
        : finishedClips.find((c) => c.id !== clip.id);
    if (!next) return '/micro?tab=done';
    return `/micro/${next.series_slug}?clip=${encodeURIComponent(next.slug)}&mode=review`;
  }, [clip, finishedClips]);

  if (error) {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center p-4 font-[family-name:var(--font-v2-arabic)] text-on-surface"
        dir="rtl"
      >
        {error}
      </div>
    );
  }
  if (!clip || !data) {
    return <ScreenLoading label="بيحمّل اللقطة…" />;
  }

  const seriesTitle =
    data.series.title_ar ?? data.series.title_tl ?? data.series.slug;

  return (
    <ClipSheet
      clip={clip}
      seriesTitle={seriesTitle}
      clipIndex={index}
      clipTotal={data.clips.length}
      initialRevealed={reviewMode ? 0 : clip.revealed_count}
      initialListening={reviewMode ? true : clip.finished}
      reviewMode={reviewMode}
      onClose={() => router.push(reviewMode ? '/micro?tab=done' : '/micro')}
      onReveal={
        reviewMode
          ? undefined
          : (count) => {
              void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'reveal',
                  revealed_count: count,
                }),
              });
            }
      }
      onFinished={() => {
        if (reviewMode) {
          if (reviewedSent.current === clip.id) return;
          reviewedSent.current = clip.id;
          void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'review' }),
          });
          return;
        }
        void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish' }),
        });
      }}
      onSaveLine={
        reviewMode
          ? undefined
          : (itemId) => {
              void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'save_line',
                  item_id: itemId,
                }),
              });
            }
      }
      onNext={() => {
        if (index + 1 < data.clips.length) setIndex(index + 1);
        else router.push('/micro');
      }}
      onReviewCards={() => {
        const deckId = data.series.official_deck_id;
        if (!deckId) {
          router.push('/micro?tab=done');
          return;
        }
        const items = clip.lines.map((l) => l.item_id).join(',');
        router.push(
          `/cards/review?deck=${encodeURIComponent(deckId)}&items=${encodeURIComponent(items)}`,
        );
      }}
      onNextReview={() => {
        router.push(nextReviewHref);
      }}
    />
  );
}
