'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { ProgressBar } from '@/components/v2/ProgressBar';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import {
  BackFace,
  FrontFace,
  RateBtn,
} from '@/components/v2/cards/CardFaces';
import { apiQuery, cardsHref } from '@/components/v2/cards/href';
import type { CardFacePayload, DeckDetail } from '@/lib/v2/decks';
import { toArDigits } from '@/lib/v2/formatAr';

type CardRow = {
  item_id: string;
  bucket: string;
  rating: string | null;
  face: CardFacePayload | null;
};

type TodayPayload = {
  status: string;
  current_day?: number;
  progress: { rated: number; total: number };
  tomorrow: number;
  cards: CardRow[];
};

type CustomSessionCard = {
  item_id: string;
  kind: 'due' | 'new';
  face: CardFacePayload | null;
};

type CustomSessionPayload = {
  deck_id: string;
  title_tl: string;
  title_ar: string;
  cards: CustomSessionCard[];
};

type Face = 'front' | 'hint' | 'back';
type Rating = 'again' | 'hard' | 'easy' | 'know';

function isCustomOrOfficialDeck(deckId: string | undefined): deckId is string {
  if (!deckId) return false;
  return (
    deckId.startsWith('custom:') ||
    deckId.startsWith('official:') ||
    /^[a-f0-9]{24}$/i.test(deckId)
  );
}

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ReviewSession({
  dayOverride,
  deckId,
  itemId,
  previewFace,
}: {
  dayOverride: number | null;
  deckId?: string;
  itemId?: string;
  previewFace?: CardFacePayload | null;
}) {
  const customMode = isCustomOrOfficialDeck(deckId);

  const [data, setData] = useState<TodayPayload | null>(null);
  const [deckMeta, setDeckMeta] = useState<DeckDetail | null | undefined>(
    deckId && !customMode ? undefined : null,
  );
  const [customSession, setCustomSession] = useState<CustomSessionPayload | null>(
    null,
  );
  const [customIndex, setCustomIndex] = useState(0);
  const [customRated, setCustomRated] = useState(0);
  const [customDone, setCustomDone] = useState(false);
  const [face, setFace] = useState<Face>('front');
  const [hintUsed, setHintUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playedOnFlip = useRef<string | null>(null);
  /** item_ids with a rating POST in flight — blocks double-tap, not the next card. */
  const ratingInFlight = useRef(new Set<string>());

  const reloadToday = useCallback(async () => {
    const res = await fetch(`/api/v2/cards/today${apiQuery(dayOverride)}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as TodayPayload;
  }, [dayOverride]);

  const loadCustom = useCallback(async () => {
    if (!deckId) throw new Error('missing_deck');
    const res = await fetch(
      `/api/v2/custom-decks/${encodeURIComponent(deckId)}/session`,
    );
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as CustomSessionPayload;
  }, [deckId]);

  useEffect(() => {
    if (customMode) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await reloadToday();
        if (cancelled) return;
        setData(payload);
      } catch {
        if (!cancelled) setError('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customMode, reloadToday]);

  useEffect(() => {
    if (!customMode || !deckId) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await loadCustom();
        if (cancelled) return;
        setCustomSession(session);
        if (session.cards.length === 0) setCustomDone(true);
      } catch {
        if (!cancelled) setError('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customMode, deckId, loadCustom]);

  useEffect(() => {
    if (customMode || !deckId) {
      if (!deckId) setDeckMeta(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/decks/${encodeURIComponent(deckId)}${apiQuery(dayOverride)}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const detail = (await res.json()) as DeckDetail;
        if (!cancelled) setDeckMeta(detail);
      } catch {
        if (!cancelled) setDeckMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customMode, deckId, dayOverride]);

  const deckIds = !deckId || customMode
    ? new Set<string>()
    : deckMeta === undefined
      ? null
      : new Set((deckMeta?.items ?? []).map((row) => row.item_id));

  const pool = (data?.cards ?? []).filter((row) => {
    if (itemId) return row.item_id === itemId;
    if (deckId && !customMode) return deckIds?.has(row.item_id) ?? false;
    return true;
  });
  const open = pool.filter((row) => !row.rating);
  const curriculumCard = open[0];
  const customCard = customSession?.cards[customIndex];
  const lookup =
    !customMode &&
    Boolean(itemId) &&
    data != null &&
    !data.cards.some((c) => c.item_id === itemId);

  const card = customMode ? customCard : curriculumCard;
  const activeFace =
    card?.face ?? (lookup ? previewFace ?? null : null);
  const playId =
    card?.item_id ?? (lookup ? itemId : undefined);

  const total = customMode
    ? (customSession?.cards.length ?? 0)
    : itemId
      ? 1
      : pool.length;
  const ratedInPool = customMode
    ? customRated
    : pool.filter((c) => c.rating).length;
  const fullDone =
    !customMode &&
    data != null &&
    data.cards.length > 0 &&
    (data.status === 'done' || data.cards.every((c) => c.rating));
  const deckMiss =
    !customMode &&
    Boolean(deckId) &&
    deckIds != null &&
    data != null &&
    !data.cards.some((c) => deckIds.has(c.item_id));

  useEffect(() => {
    if (face !== 'back' || !activeFace?.tl || !playId) return;
    if (playedOnFlip.current === playId) return;
    playedOnFlip.current = playId;
    void fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: activeFace.tl, lang: 'pt' }),
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        void audio.play().catch(() => URL.revokeObjectURL(url));
      })
      .catch(() => undefined);
  }, [face, playId, activeFace?.tl]);

  function rate(rating: Rating) {
    if (!card || busy) return;
    if (hintUsed && (rating === 'easy' || rating === 'know')) return;
    const itemIdRated = card.item_id;
    if (ratingInFlight.current.has(itemIdRated)) return;
    ratingInFlight.current.add(itemIdRated);
    setBusy(true);
    setError(null);

    if (customMode && deckId) {
      const prevRated = customRated;
      const prevIndex = customIndex;
      const nextRated = customRated + 1;
      const nextIndex = customIndex + 1;
      setCustomRated(nextRated);
      // TODO(P11): when nextRated >= 10, notify streak/progress events.
      if (!customSession || nextIndex >= customSession.cards.length) {
        setCustomDone(true);
      } else {
        setCustomIndex(nextIndex);
        setFace('front');
        setHintUsed(false);
        playedOnFlip.current = null;
      }
      setBusy(false);

      void fetch('/api/v2/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'card_review',
          answer_id: newAnswerId(),
          day: 1,
          item_id: itemIdRated,
          rating,
          deck_id: deckId,
          hint: hintUsed,
        }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
        })
        .catch(() => {
          setCustomRated(prevRated);
          setCustomIndex(prevIndex);
          setCustomDone(false);
          setFace('back');
          setError('rate_failed');
        })
        .finally(() => {
          ratingInFlight.current.delete(itemIdRated);
        });
      return;
    }

    setData((cur) => {
      if (!cur) return cur;
      const cards = cur.cards.map((row) =>
        row.item_id === itemIdRated ? { ...row, rating } : row,
      );
      const rated = cards.filter((c) => c.rating).length;
      const allRated = cards.length > 0 && cards.every((c) => c.rating);
      return {
        ...cur,
        cards,
        progress: { ...cur.progress, rated },
        status: allRated ? 'done' : cur.status,
      };
    });
    setFace('front');
    setHintUsed(false);
    playedOnFlip.current = null;
    setBusy(false);

    // Do not reload /today after accept — job may not have applied yet.
    void fetch(`/api/v2/cards/${encodeURIComponent(itemIdRated)}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
      })
      .catch(() => {
        setData((cur) => {
          if (!cur) return cur;
          const cards = cur.cards.map((row) =>
            row.item_id === itemIdRated ? { ...row, rating: null } : row,
          );
          const rated = cards.filter((c) => c.rating).length;
          return {
            ...cur,
            cards,
            progress: { ...cur.progress, rated },
            status: 'open',
          };
        });
        setFace('back');
        setError('rate_failed');
      })
      .finally(() => {
        ratingInFlight.current.delete(itemIdRated);
      });
  }

  const loading = customMode
    ? !customSession && !error
    : !data || (Boolean(deckId) && deckMeta === undefined);

  if (error && (customMode ? !customSession : !data)) {
    return (
      <p className="p-4 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        مش قادرين نفتح المراجعة.
      </p>
    );
  }

  if (loading) {
    return <ScreenLoading fullScreen label="بنجهّز الجلسة…" />;
  }

  if (customMode && customDone) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <Icon name="check_circle" size={32} className="text-v2-primary" />
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl font-bold text-v2-primary">
          خلّصت {toArDigits(customRated)}
        </h1>
        <PrimaryButton href={cardsHref('/cards', dayOverride)}>
          رجوع للكروت
        </PrimaryButton>
      </main>
    );
  }

  if (fullDone && !itemId && !deckId) {
    return (
      <EndScreen
        total={data!.progress.total}
        tomorrow={data!.tomorrow}
        dayOverride={dayOverride}
      />
    );
  }

  if (deckMiss) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <p className="font-[family-name:var(--font-v2-arabic)] text-lg text-v2-primary">
          مفيش كروت من الموقف ده في مراجعة النهارده
        </p>
        <PrimaryButton href={cardsHref('/cards', dayOverride)}>
          رجوع للكروت
        </PrimaryButton>
      </main>
    );
  }

  if (
    !customMode &&
    (deckId || itemId) &&
    !lookup &&
    open.length === 0
  ) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl font-bold text-v2-primary">
          خلّصت
        </h1>
        <PrimaryButton href={cardsHref('/cards', dayOverride)}>
          رجوع للكروت
        </PrimaryButton>
      </main>
    );
  }

  const showRating = Boolean(card) && !lookup;
  const position = lookup
    ? 1
    : Math.min(ratedInPool + (card ? 1 : 0), Math.max(total, 1));
  const progressValue = total ? ratedInPool / total : 0;
  const day = customMode
    ? null
    : (data?.current_day ?? dayOverride ?? 1);
  const headerTitle = customMode
    ? customSession?.title_tl?.trim() ||
      customSession?.title_ar?.trim() ||
      'راجع الديك ده'
    : reviewHeaderTitle(deckId, deckMeta);
  const closeHref = customMode && deckId
    ? cardsHref(`/cards/deck/${encodeURIComponent(deckId)}`, dayOverride)
    : cardsHref('/cards', dayOverride);

  return (
    <main className="flex min-h-dvh flex-1 flex-col px-4 pb-8 pt-4">
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={closeHref}
            aria-label="قفل"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-v2-primary"
          >
            <Icon name="close" size={24} />
          </Link>
          <p className="min-w-0 truncate font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary">
            {headerTitle} · {toArDigits(position)} / {toArDigits(total)}
          </p>
        </div>
        <ProgressBar value={progressValue} label="تقدم المراجعة" />
      </header>

      <article className="flex min-h-[60dvh] w-full flex-col rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]">
        {face === 'front' || face === 'hint' ? (
          <FrontFace
            face={activeFace}
            showHint={face === 'hint'}
            onFlip={() => setFace('back')}
            onHint={() => {
              setHintUsed(true);
              setFace('hint');
            }}
          />
        ) : (
          <BackFace
            face={activeFace}
            hintUsed={hintUsed}
            day={day}
            deckId={customMode ? deckId : undefined}
          />
        )}
      </article>

      {face === 'back' && showRating ? (
        <div className="mt-6 flex flex-col gap-2">
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            {hintUsed
              ? 'التلميح قفل التقييم على صعب أو متوسط'
              : 'قدّر قد إيه كانت سهلة'}
          </p>
          <div className="grid grid-cols-3 gap-3" dir="rtl">
            <RateBtn
              label="صعب"
              icon="replay"
              disabled={busy}
              onClick={() => void rate('again')}
            />
            <RateBtn
              label="متوسط"
              icon="sentiment_neutral"
              disabled={busy}
              onClick={() => void rate('hard')}
            />
            <RateBtn
              label="سهل"
              icon="sentiment_very_satisfied"
              disabled={busy || hintUsed}
              onClick={() => void rate('easy')}
            />
          </div>
          <button
            type="button"
            disabled={busy || hintUsed}
            onClick={() => void rate('know')}
            className="min-h-11 w-full font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted disabled:opacity-40"
          >
            عارفها
          </button>
        </div>
      ) : null}

      {lookup && face === 'back' ? (
        <PrimaryButton
          href={cardsHref('/cards', dayOverride)}
          className="mt-6 w-full"
        >
          رجوع
        </PrimaryButton>
      ) : null}
    </main>
  );
}

function reviewHeaderTitle(
  deckId: string | undefined,
  deckMeta: DeckDetail | null | undefined,
): string {
  if (!deckId) return 'مراجعة النهارده';
  if (deckId === 'weak') return 'اللي بتغلط فيه';
  if (deckMeta?.title_tl?.trim()) return deckMeta.title_tl.trim();
  if (deckMeta?.title_ar?.trim()) return deckMeta.title_ar.trim();
  return 'مراجعة النهارده';
}

function EndScreen({
  total,
  tomorrow,
  dayOverride,
}: {
  total: number;
  tomorrow: number;
  dayOverride: number | null;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <Icon name="check_circle" size={32} className="text-v2-primary" />
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl font-bold text-v2-primary">
        خلّصت {toArDigits(total)} · بكرة {toArDigits(tomorrow)}
      </h1>
      <PrimaryButton href={cardsHref('/cards', dayOverride)}>
        رجوع للكروت
      </PrimaryButton>
    </main>
  );
}
