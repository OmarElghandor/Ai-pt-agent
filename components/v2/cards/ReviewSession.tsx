'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { ProgressBar } from '@/components/v2/ProgressBar';
import { ReportErrorButton } from '@/components/v2/ReportErrorButton';
import { TargetWord } from '@/components/v2/cards/TargetWord';
import { VerbPoster } from '@/components/v2/cards/VerbPoster';
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

type Face = 'front' | 'hint' | 'back';
type Rating = 'again' | 'hard' | 'easy' | 'know';

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
  const [data, setData] = useState<TodayPayload | null>(null);
  const [deckMeta, setDeckMeta] = useState<DeckDetail | null | undefined>(
    deckId ? undefined : null,
  );
  const [face, setFace] = useState<Face>('front');
  const [hintUsed, setHintUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playedOnFlip = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/v2/cards/today${apiQuery(dayOverride)}`);
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as TodayPayload;
  }, [dayOverride]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await reload();
        if (cancelled) return;
        setData(payload);
      } catch {
        if (!cancelled) setError('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!deckId) {
      setDeckMeta(null);
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
  }, [deckId, dayOverride]);

  const deckIds = !deckId
    ? new Set<string>()
    : deckMeta === undefined
      ? null
      : new Set((deckMeta?.items ?? []).map((row) => row.item_id));

  const pool = (data?.cards ?? []).filter((row) => {
    if (itemId) return row.item_id === itemId;
    if (deckId) return deckIds?.has(row.item_id) ?? false;
    return true;
  });
  const open = pool.filter((row) => !row.rating);
  const card = open[0];
  const lookup =
    Boolean(itemId) &&
    data != null &&
    !data.cards.some((c) => c.item_id === itemId);
  const activeFace = card?.face ?? (lookup ? previewFace ?? null : null);
  const playId = card?.item_id ?? (lookup ? itemId : undefined);
  const total = itemId ? 1 : pool.length;
  const ratedInPool = pool.filter((c) => c.rating).length;
  const fullDone =
    data != null &&
    data.cards.length > 0 &&
    (data.status === 'done' || data.cards.every((c) => c.rating));
  const deckMiss =
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

  async function rate(rating: Rating) {
    if (!card || busy) return;
    if (hintUsed && (rating === 'easy' || rating === 'know')) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v2/cards/${encodeURIComponent(card.item_id)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating }),
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const next = await reload();
      setData(next);
      setFace('front');
      setHintUsed(false);
      playedOnFlip.current = null;
    } catch {
      setError('rate_failed');
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <p className="p-4 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        مش قادرين نفتح المراجعة.
      </p>
    );
  }

  if (!data || (deckId && deckMeta === undefined)) {
    return (
      <p className="p-4 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        بنجهّز الجلسة…
      </p>
    );
  }

  if (fullDone && !itemId && !deckId) {
    return (
      <EndScreen
        total={data.progress.total}
        tomorrow={data.tomorrow}
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

  if ((deckId || itemId) && !lookup && open.length === 0) {
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
  const day = data.current_day ?? dayOverride ?? 1;
  const headerTitle = reviewHeaderTitle(deckId, deckMeta);

  return (
    <main className="flex min-h-dvh flex-1 flex-col px-4 pb-8 pt-4">
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={cardsHref('/cards', dayOverride)}
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
          <BackFace face={activeFace} hintUsed={hintUsed} day={day} />
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

function FrontFace({
  face,
  showHint,
  onFlip,
  onHint,
}: {
  face: CardFacePayload | null;
  showHint: boolean;
  onFlip: () => void;
  onHint: () => void;
}) {
  if (!face) {
    return (
      <p className="m-auto font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        الكارت ناقص بيانات.
      </p>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-1 flex-col">
      <div className="flex flex-[0_0_33%] flex-col items-center justify-start gap-5 pt-6">
        <TargetWord tl={face.tl} gender={face.gender} size="xl" />
        <AudioButton text={face.tl} showSlow label="اسمع" />
        {showHint && face.hint_tl ? (
          <p
            dir="ltr"
            className="max-w-full rounded-v2-row bg-v2-note/40 px-4 py-3 text-center font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
            style={{ unicodeBidi: 'isolate' }}
          >
            {face.hint_tl}
          </p>
        ) : null}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-3 pb-1 pt-8">
        <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          فاكر معناها؟ قولها في سرّك واقلب
        </p>
        <PrimaryButton className="w-full" onClick={onFlip}>
          اقلب
        </PrimaryButton>
        {!showHint && face.hint_tl ? (
          <button
            type="button"
            onClick={onHint}
            className="min-h-11 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-primary"
          >
            محتاج تلميح؟
          </button>
        ) : showHint ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action">
            استخدمت تلميح
          </p>
        ) : null}
      </div>
    </div>
  );
}

function BackFace({
  face,
  hintUsed,
  day,
}: {
  face: CardFacePayload | null;
  hintUsed: boolean;
  day: number;
}) {
  if (!face) return null;

  const showWordBlock =
    face.kind === 'word' && Boolean(face.plural || face.example);

  return (
    <div className="flex h-auto flex-col gap-4">
      <div className="space-y-1 text-center">
        <TargetWord
          tl={face.tl}
          gender={face.gender}
          size="lg"
          nounTone="ink"
        />
        {face.ar ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xl text-v2-ink">
            {face.ar}
          </p>
        ) : null}
        {face.say ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {face.say}
          </p>
        ) : null}
        {hintUsed ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-action">
            استخدمت تلميح · التقييم مقفول على صعب أو متوسط
          </p>
        ) : null}
      </div>

      <ImageSlot variant="flashcard" />

      {face.kind === 'verb' && face.conjugation ? (
        <VerbPoster
          lemma={face.lemma ?? face.tl}
          verbClass={face.verbClass}
          rows={face.conjugation}
        />
      ) : null}

      {showWordBlock ? (
        <div className="flex flex-col gap-3">
          {face.plural ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              الجمع:{' '}
              <span
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-ink"
                style={{ unicodeBidi: 'isolate' }}
              >
                {face.plural}
              </span>
            </p>
          ) : null}
          {face.example ? (
            <div className="flex items-center gap-2" dir="ltr">
              <AudioButton text={face.example} label={`نطق ${face.example}`} />
              <p
                className="min-w-0 font-[family-name:var(--font-v2-target)] text-sm text-v2-ink"
                style={{ unicodeBidi: 'isolate' }}
              >
                {face.example}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {face.kind === 'phrase' ? <PhraseBack face={face} /> : null}

      <ReportErrorButton day={day} itemId={face.item_id} label="فيه غلط" />
    </div>
  );
}

function PhraseBack({ face }: { face: CardFacePayload }) {
  const heard = face.role === 'heard';
  const hasSaidContext = Boolean(face.context_eg || face.replies_to_tl);
  const hasVariation = Boolean(face.variation_tl);
  if (!heard && !hasSaidContext && !hasVariation) return null;

  return (
    <div className="flex flex-col gap-2">
      {heard ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          هتسمعها
        </p>
      ) : (
        <>
          {face.context_eg ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              امتى تقولها: {face.context_eg}
            </p>
          ) : null}
          {face.replies_to_tl ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              هتسمع:{' '}
              <span
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
                style={{ unicodeBidi: 'isolate' }}
              >
                {face.replies_to_tl}
              </span>
            </p>
          ) : null}
        </>
      )}
      {face.variation_tl ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          شكل تاني:{' '}
          <span
            dir="ltr"
            className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
            style={{ unicodeBidi: 'isolate' }}
          >
            {face.variation_tl}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function RateBtn({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 flex-col items-center justify-center rounded-xl bg-v2-paper-deep py-3 text-v2-primary disabled:opacity-40"
    >
      <Icon name={icon} size={24} />
      <span className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold">
        {label}
      </span>
    </button>
  );
}
