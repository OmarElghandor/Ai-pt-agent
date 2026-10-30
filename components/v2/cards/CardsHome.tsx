'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { ProgressBar } from '@/components/v2/ProgressBar';
import { RichText } from '@/components/v2/RichText';
import { apiQuery, cardsHref } from '@/components/v2/cards/href';
import { toArDigits } from '@/lib/v2/formatAr';
import type {
  DecksListing,
  SituationDeckSummary,
  VerbDeckSummary,
} from '@/lib/v2/decks';

type TodayRes = {
  status: string;
  progress: { rated: number; total: number };
  tomorrow: number;
  mix: { recent: number; weak: number; older: number };
  cards: { item_id: string }[];
};

type Tab = 'situations' | 'verbs';

const VERB_TILE: Record<string, string> = {
  ar: 'text-v2-verb-ar-text',
  er: 'text-v2-verb-er',
  ir: 'text-v2-verb-ir-text',
  irregular: 'text-v2-verb-irregular',
};

export function CardsHome({ dayOverride }: { dayOverride: number | null }) {
  const [tab, setTab] = useState<Tab>('situations');
  const [listing, setListing] = useState<DecksListing | null>(null);
  const [today, setToday] = useState<TodayRes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = apiQuery(dayOverride);
    (async () => {
      try {
        const [dRes, tRes] = await Promise.all([
          fetch(`/api/v2/decks${q}`),
          fetch(`/api/v2/cards/today${q}`),
        ]);
        if (!dRes.ok) throw new Error(`decks ${dRes.status}`);
        if (!tRes.ok) throw new Error(`today ${tRes.status}`);
        const d = (await dRes.json()) as DecksListing;
        const t = (await tRes.json()) as TodayRes;
        if (!cancelled) {
          setListing(d);
          setToday(t);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dayOverride]);

  if (error) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        مش قادرين نحمّل الكروت دلوقتي.
      </p>
    );
  }

  if (!listing || !today) {
    return (
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        بنجهّز الكروت…
      </p>
    );
  }

  const total = today.progress.total;
  const remaining = Math.max(0, total - today.progress.rated);
  const done = today.status === 'done' || (total > 0 && remaining === 0);
  const queueIds = new Set(today.cards.map((c) => c.item_id));

  return (
    <main className="flex flex-1 flex-col gap-6 pb-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-[32px] font-bold leading-10 text-v2-primary">
          الكروت
        </h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-v2-primary-tint px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-primary">
            بتفهم {toArDigits(listing.understood)}
          </span>
          <span className="rounded-full bg-v2-action-tint px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-action">
            بتقول {toArDigits(listing.said)}
          </span>
        </div>
      </header>

      <section className="overflow-hidden rounded-v2-card bg-v2-primary p-4 text-white shadow-[var(--shadow-v2-soft)]">
        <div className="mb-3 flex items-start justify-between">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-v2-action" />
            مراجعة النهارده
          </span>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Icon name="style" size={24} className="text-white" />
          </span>
        </div>
        <h2 className="mb-1 font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold leading-8">
          {done
            ? `خلّصت ${toArDigits(total)} · بكرة ${toArDigits(today.tomorrow)}`
            : total === 0
              ? 'مفيش كروت النهارده'
              : `${toArDigits(total)} كارت · ٣ دقايق`}
        </h2>
        <p className="mb-4 font-[family-name:var(--font-v2-arabic)] text-sm text-white/80">
          {toArDigits(today.mix.recent)} من الأسبوع ده ·{' '}
          {toArDigits(today.mix.weak)} بتغلط فيها ·{' '}
          {toArDigits(today.mix.older)} قديمة
        </p>
        {done || total === 0 ? null : (
          <PrimaryButton
            href={cardsHref('/cards/review', dayOverride)}
            className="w-full"
          >
            ابدأ
          </PrimaryButton>
        )}
      </section>

      {listing.weakCount > 0 ? (
        <Link
          href={cardsHref('/cards/deck/weak', dayOverride)}
          className="flex min-h-11 items-center justify-between gap-3 rounded-v2-row border-2 border-v2-action bg-v2-action-tint px-4 py-3"
        >
          <p className="font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-action">
            اللي بتغلط فيه · {toArDigits(listing.weakCount)} كروت
          </p>
          <span className="inline-flex items-center gap-1 font-[family-name:var(--font-v2-arabic)] text-sm font-bold text-v2-action">
            راجعهم
            <Icon name="arrow_back" size={20} />
          </span>
        </Link>
      ) : (
        <p className="flex min-h-11 items-center rounded-v2-row bg-v2-card px-4 py-3 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted shadow-[var(--shadow-v2-soft)]">
          مفيش حاجة بتغلط فيها ✓
        </p>
      )}

      <div className="flex rounded-v2-chip bg-v2-paper-deep p-1">
        {(
          [
            ['situations', 'المواقف'],
            ['verbs', 'الأفعال'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              'min-h-11 flex-1 rounded-v2-chip font-[family-name:var(--font-v2-arabic)] text-sm font-semibold',
              tab === id
                ? 'bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]'
                : 'text-v2-ink-muted',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'situations' ? (
        <ul className="flex flex-col gap-3">
          {listing.situations.map((deck) => (
            <SituationRow
              key={deck.id}
              deck={deck}
              dayOverride={dayOverride}
              queueIds={queueIds}
            />
          ))}
        </ul>
      ) : listing.verbs.length === 0 ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          لسه ما قابلتش أفعال.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {listing.verbs.map((v) => (
            <VerbTile key={v.id} verb={v} dayOverride={dayOverride} />
          ))}
        </div>
      )}

      <details className="rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]">
        <summary className="cursor-pointer font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary">
          اتخرّجت ✓ {toArDigits(listing.graduatedTotal)} كلمة وجملة
        </summary>
      </details>
    </main>
  );
}

function SituationRow({
  deck,
  dayOverride,
  queueIds,
}: {
  deck: SituationDeckSummary;
  dayOverride: number | null;
  queueIds: Set<string>;
}) {
  const locked = deck.status !== 'open';
  const todayCount = deck.item_ids.filter((id) => queueIds.has(id)).length;
  const inner = (
    <div
      className={[
        'flex gap-3 rounded-v2-card bg-v2-card p-3 shadow-[var(--shadow-v2-soft)]',
        locked ? 'opacity-50' : '',
      ].join(' ')}
    >
      <ImageSlot
        variant="deckRow"
        placeholderIcon={locked ? 'lock' : 'image'}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-v2-primary">
          <RichText
            segments={[
              { text: deck.situation_tl, lang: 'tl', bold: true },
              { text: ' · ', lang: 'tl' },
              { text: deck.situation_eg, lang: 'eg' },
            ]}
          />
        </p>
        <p className="mt-1 text-xs text-v2-ink-muted">
          <RichText
            segments={
              locked
                ? [
                    { text: 'يفتح ', lang: 'eg' },
                    { text: `Dia ${deck.day}`, lang: 'tl' },
                  ]
                : [{ text: `Dia ${deck.day}`, lang: 'tl' }]
            }
          />
        </p>
        {locked ? null : (
          <>
            <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {toArDigits(deck.total)} كارت · {toArDigits(todayCount)} النهارده
            </p>
            <div className="mt-2">
              <ProgressBar
                value={deck.total ? deck.graduated / deck.total : 0}
                label={`${toArDigits(deck.graduated)} اتخرّجوا`}
              />
              <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted">
                {toArDigits(deck.graduated)} اتخرّجوا
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (locked) return <li>{inner}</li>;
  return (
    <li>
      <Link href={cardsHref(`/cards/deck/${encodeURIComponent(deck.id)}`, dayOverride)}>
        {inner}
      </Link>
    </li>
  );
}

function VerbTile({
  verb,
  dayOverride,
}: {
  verb: VerbDeckSummary;
  dayOverride: number | null;
}) {
  const color = VERB_TILE[verb.verbClass] ?? VERB_TILE.irregular;
  return (
    <Link
      href={cardsHref(`/cards/deck/${encodeURIComponent(verb.id)}`, dayOverride)}
      className="flex flex-col gap-2 rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]"
    >
      <p
        dir="ltr"
        className={[
          'font-[family-name:var(--font-v2-target)] text-2xl font-bold uppercase',
          color,
        ].join(' ')}
      >
        {verb.lemma}
      </p>
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        {verb.meaning_ar}
      </p>
      {verb.irregular ? (
        <span className="inline-flex items-center gap-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-verb-irregular">
          <Icon name="bolt" size={20} />
          شاذ
        </span>
      ) : null}
      <ProgressBar
        value={verb.total ? verb.graduated / verb.total : 0}
        label={verb.graduated ? 'اتخرّج' : 'لسه'}
      />
    </Link>
  );
}
