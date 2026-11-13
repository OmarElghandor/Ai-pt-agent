'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { RichText } from '@/components/v2/RichText';
import { TargetWord } from '@/components/v2/cards/TargetWord';
import { apiQuery, cardsHref } from '@/components/v2/cards/href';
import { toArDigits } from '@/lib/v2/formatAr';
import type { DeckDetail } from '@/lib/v2/decks';

const STATUS_LABEL: Record<DeckDetail['items'][number]['status'], string> = {
  new: 'جديد',
  reviewing: 'بيتراجع',
  weak: 'بتغلط فيه',
  graduated: 'اتخرّج ✓',
};

export function DeckDetailView({
  deckId,
  dayOverride,
}: {
  deckId: string;
  dayOverride: number | null;
}) {
  const [deck, setDeck] = useState<DeckDetail | null>(null);
  const [todayIds, setTodayIds] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/v2/decks/${encodeURIComponent(deckId)}${apiQuery(dayOverride)}`,
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as DeckDetail;
        if (!cancelled) setDeck(data);
      } catch {
        if (!cancelled) setError('failed');
      }
    })();
    (async () => {
      try {
        const res = await fetch(`/api/v2/cards/today${apiQuery(dayOverride)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { cards?: { item_id: string }[] };
        if (!cancelled) {
          setTodayIds(new Set((data.cards ?? []).map((c) => c.item_id)));
        }
      } catch {
        if (!cancelled) setTodayIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, dayOverride]);

  if (error) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        الموقف مش موجود.
      </p>
    );
  }
  if (!deck) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        بنحمّل…
      </p>
    );
  }

  const detail = deck;
  const isUgC = detail.kind === 'custom' || detail.kind === 'official';
  const bareId = detail.id.replace(/^(custom|official):/, '');
  const reviewLabel =
    detail.kind === 'verb'
      ? 'راجع الفعل ده'
      : detail.kind === 'weak'
        ? 'راجعهم'
        : isUgC
          ? 'راجع الديك ده'
          : 'راجع الموقف ده بس';

  async function addDeck() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v2/custom-decks/${encodeURIComponent(bareId)}/add`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deck_kind: detail.kind === 'official' ? 'official' : 'custom',
          }),
        },
      );
      if (!res.ok) throw new Error('add');
      setDeck({ ...detail, added: true });
      setMsg('اتضاف لديك ديكاتي');
    } catch {
      setMsg('ما قدرناش نضيف الديك');
    } finally {
      setBusy(false);
    }
  }

  async function reportDeck() {
    if (busy || detail.kind !== 'custom') return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v2/custom-decks/${encodeURIComponent(bareId)}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'wrong_word' }),
        },
      );
      if (!res.ok) throw new Error('report');
      setMsg('شكراً، بلّغنا عن الديك');
    } catch {
      setMsg('ما قدرناش نبلّغ دلوقتي');
    } finally {
      setBusy(false);
    }
  }

  async function resetDeckProgress() {
    if (busy) return;
    const ok = window.confirm(
      'هترجع كل كروت الديك ده جديد عندك من الأول. لو كلمة موجودة في ديك تاني عندك، هتتصفر هناك كمان. الديك نفسه مش هيتغيّر، ومش هيتأثر حد تاني.',
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/v2/decks/${encodeURIComponent(deckId)}/reset${apiQuery(dayOverride)}`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error('reset');
      const refreshed = await fetch(
        `/api/v2/decks/${encodeURIComponent(deckId)}${apiQuery(dayOverride)}`,
      );
      if (!refreshed.ok) throw new Error('refresh');
      const data = (await refreshed.json()) as DeckDetail;
      setDeck(data);
      setMsg('اتصفّر الديك · تقدّر تبدأ من الأول');
    } catch {
      setMsg('ما قدرناش نصفر الديك دلوقتي');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-6 pb-8">
      <header className="flex items-center gap-2">
        <Link
          href={cardsHref('/cards', dayOverride)}
          aria-label="رجوع"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-v2-primary"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-[family-name:var(--font-v2-target)] text-lg font-semibold text-v2-primary">
            <RichText segments={[{ text: deck.title_tl, lang: 'tl', bold: true }]} />
          </h1>
          {deck.day ? (
            <p className="mt-1 text-xs text-v2-ink-muted">
              <RichText
                segments={[
                  { text: `Dia ${deck.day}`, lang: 'tl' },
                  ...(deck.situation_eg
                    ? [
                        { text: ' · ', lang: 'tl' as const },
                        { text: deck.situation_eg, lang: 'eg' as const },
                      ]
                    : []),
                ]}
              />
            </p>
          ) : null}
        </div>
      </header>

      <ImageSlot variant="cover" />

      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="الكل" value={deck.total} />
        <Stat
          label="النهارده"
          value={
            todayIds
              ? deck.items.filter((row) => todayIds.has(row.item_id)).length
              : deck.today
          }
        />
        <Stat label="اتخرّج" value={deck.graduated} />
      </div>

      {isUgC && !deck.added ? (
        <PrimaryButton
          type="button"
          className="w-full"
          disabled={busy}
          onClick={() => void addDeck()}
        >
          ضيفه
        </PrimaryButton>
      ) : null}

      <PrimaryButton
        href={cardsHref('/cards/review', dayOverride, { deck: deckId })}
        className="w-full"
      >
        {reviewLabel}
      </PrimaryButton>

      <button
        type="button"
        disabled={busy}
        onClick={() => void resetDeckProgress()}
        className="min-h-11 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline"
      >
        ابدأ الديك من الأول
      </button>

      {msg ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {msg}
        </p>
      ) : null}

      {deck.reportable ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void reportDeck()}
          className="min-h-11 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline"
        >
          بلّغ عن الديك ده
        </button>
      ) : null}

      <ul className="flex flex-col gap-2">
        {deck.items.map((row) => (
          <li
            key={row.item_id}
            className="flex items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
          >
            <AudioButton text={row.tl} size="chip" label={`نطق ${row.tl}`} />
            <Link
              href={cardsHref('/cards/review', dayOverride, {
                item: row.item_id,
              })}
              className="min-w-0 flex-1"
            >
              <TargetWord tl={row.tl} gender={row.gender} />
            </Link>
            <span className="shrink-0 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {STATUS_LABEL[row.status]}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-v2-row bg-v2-card px-2 py-3 shadow-[var(--shadow-v2-soft)]">
      <p className="font-[family-name:var(--font-v2-target)] text-xl font-bold text-v2-primary">
        {toArDigits(value)}
      </p>
      <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
        {label}
      </p>
    </div>
  );
}
