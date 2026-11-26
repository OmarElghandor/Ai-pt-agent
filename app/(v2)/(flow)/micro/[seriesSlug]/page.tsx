'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ClipSheet, type ClipView } from '@/components/v2/micro/ClipSheet';
import { ScreenLoading } from '@/components/v2/ScreenLoading';

type SeriesPayload = {
  series: {
    slug: string;
    title_ar?: string;
    title_tl?: string;
    official_deck_id: string | null;
  };
  clips: Array<
    ClipView & { slug: string; revealed_count: number; finished: boolean }
  >;
};

export default function MicroSeriesPage() {
  const params = useParams<{ seriesSlug: string }>();
  const router = useRouter();
  const [data, setData] = useState<SeriesPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/micro/series/${params.seriesSlug}`);
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error ?? 'error');
          return;
        }
        if (!cancelled) {
          setData(json);
          const firstUnfinished = (
            json.clips as SeriesPayload['clips']
          ).findIndex((c) => !c.finished);
          setIndex(firstUnfinished >= 0 ? firstUnfinished : 0);
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
  }, [params.seriesSlug]);

  const clip = data?.clips[index];

  useEffect(() => {
    if (!clip) return;
    void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
  }, [clip?.id]);

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
      initialRevealed={clip.revealed_count}
      initialListening={clip.finished}
      onClose={() => router.push('/micro')}
      onReveal={(count) => {
        void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reveal', revealed_count: count }),
        });
      }}
      onFinished={() => {
        void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finish' }),
        });
      }}
      onSaveLine={(itemId) => {
        void fetch(`/api/v2/micro/clips/${clip.id}/progress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_line', item_id: itemId }),
        });
      }}
      onNext={() => {
        if (index + 1 < data.clips.length) setIndex(index + 1);
        else router.push('/micro');
      }}
    />
  );
}
