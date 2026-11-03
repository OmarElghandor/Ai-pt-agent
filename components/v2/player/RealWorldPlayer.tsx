'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { RichText } from '@/components/v2/RichText';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { Rt } from '@/lib/v2/content/rt';
import { plainRt } from '@/lib/v2/render/speechTarget';
import { playSpeech } from './speech';
import { markPageDone } from './session';

type Props = {
  day: number;
  page: Page;
  items: Item[];
  situationEg?: string;
  titleTl?: string;
  nextHref?: string | null;
};

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}

function phraseTl(item: Item, preferF: boolean): string {
  if (!('tl' in item)) return '';
  if (preferF && 'tl_f' in item && item.tl_f) return String(item.tl_f);
  return String(item.tl ?? '');
}

export function RealWorldPlayer({
  day,
  page,
  items,
  situationEg,
  titleTl,
  nextHref = null,
}: Props) {
  const bank = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const phraseIds = page.real_world?.phrase_ids ?? [];
  const categories = page.real_world?.categories ?? [];
  const tipBlock = page.blocks.find((b) => b.type === 'tip');

  const phrases = useMemo(() => {
    return phraseIds
      .map((id, i) => {
        const item = bank.get(id);
        if (!item || item.type !== 'phrase') return null;
        return {
          id,
          index: i + 1,
          item,
          category: (item as { category?: string }).category ?? 'other',
          tag: (item as { tag?: string }).tag ?? '',
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      index: number;
      item: Extract<Item, { type: 'phrase' }>;
      category: string;
      tag: string;
    }>;
  }, [phraseIds, bank]);

  const [coverOn, setCoverOn] = useState(page.cover === 'meaning');
  const [peekId, setPeekId] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('all');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  const filtered =
    cat === 'all' ? phrases : phrases.filter((p) => p.category === cat);

  const titleText = plainRt(page.title) || 'بيقولوها كده';
  const subtitleText = page.subtitle ? plainRt(page.subtitle) : situationEg;
  const pill =
    page.pill ||
    (titleTl && situationEg
      ? `${titleTl.toUpperCase()} · ${situationEg}`
      : situationEg);

  async function onAddCard(itemId: string) {
    if (added.has(itemId) || adding) return;
    setAdding(itemId);
    try {
      const res = await fetch(`/api/v2/cards/${encodeURIComponent(itemId)}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      if (res.ok) {
        setAdded((prev) => new Set(prev).add(itemId));
      }
    } finally {
      setAdding(null);
    }
  }

  function onNext() {
    markPageDone(day, page.id);
  }

  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper text-v2-ink"
    >
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-v2-line/60 bg-v2-paper/90 px-3 backdrop-blur">
        <Link
          href={`/day/${day}`}
          aria-label="رجوع"
          className="flex h-10 w-10 items-center justify-center rounded-full text-v2-ink hover:bg-v2-paper-deep"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary">
          بيقولوها كده
        </h1>
      </header>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-28 pt-3">
        <section className="rounded-v2-row bg-v2-paper-deep p-4 shadow-[var(--shadow-v2-soft)]">
          {pill ? (
            <span className="mb-2 inline-block rounded-full bg-v2-primary px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-medium tracking-wide text-white">
              {pill}
            </span>
          ) : null}
          <h2 className="font-[family-name:var(--font-v2-arabic)] text-xl font-bold leading-tight text-v2-primary">
            {titleText}
          </h2>
          {subtitleText ? (
            <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-muted">
              {subtitleText}
            </p>
          ) : null}
        </section>

        <div className="flex items-center justify-between gap-2">
          <span className="font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-muted">
            {toArabicDigits(phrases.length)} عبارات
          </span>
          <button
            type="button"
            onClick={() => {
              setCoverOn((v) => !v);
              setPeekId(null);
            }}
            className="flex items-center gap-1.5 rounded-full bg-v2-paper-deep px-2.5 py-1 text-v2-ink shadow-[var(--shadow-v2-soft)]"
          >
            <Icon name={coverOn ? 'visibility' : 'visibility_off'} size={20} />
            <span className="font-[family-name:var(--font-v2-arabic)] text-xs font-medium">
              {coverOn ? 'إظهار المعنى' : 'غطّي المعنى'}
            </span>
          </button>
        </div>

        {categories.length >= 2 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCat('all')}
              className={[
                'shrink-0 rounded-full px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-xs font-medium',
                cat === 'all'
                  ? 'bg-v2-primary text-white'
                  : 'bg-v2-paper-deep text-v2-ink',
              ].join(' ')}
            >
              الكل ({toArabicDigits(phrases.length)})
            </button>
            {categories.map((c) => {
              const n = phrases.filter((p) => p.category === c.id).length;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={[
                    'shrink-0 rounded-full px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-xs font-medium',
                    cat === c.id
                      ? 'bg-v2-primary text-white'
                      : 'bg-v2-paper-deep text-v2-ink',
                  ].join(' ')}
                >
                  {c.label_eg} ({toArabicDigits(n)})
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {filtered.map((row) => {
            const tl = phraseTl(row.item, false);
            const say = row.item.say ?? '';
            const meaningHidden = coverOn && peekId !== row.id;
            return (
              <article
                key={row.id}
                className="rounded-v2-row bg-white p-4 shadow-[var(--shadow-v2-soft)]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-v2-paper-deep font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-primary">
                      {toArabicDigits(row.index)}
                    </span>
                    {row.tag ? (
                      <span className="rounded-full bg-v2-paper-deep px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-primary">
                        {row.tag}
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="استمع"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-v2-paper-deep text-v2-primary"
                    onClick={() => {
                      void playSpeech(tl, 'pt', new AbortController().signal);
                    }}
                  >
                    <Icon name="volume_up" size={20} />
                  </button>
                </div>
                <div dir="ltr" className="mb-1 text-left">
                  <p className="font-[family-name:var(--font-v2-target)] text-lg font-semibold text-v2-primary">
                    {tl}
                  </p>
                  {say ? (
                    <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-muted">
                      {say}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="mt-1 w-full text-start"
                  onClick={() => {
                    if (!coverOn) return;
                    setPeekId((cur) => (cur === row.id ? null : row.id));
                  }}
                >
                  <p
                    className={[
                      'font-[family-name:var(--font-v2-arabic)] text-sm font-medium text-v2-ink transition',
                      meaningHidden
                        ? 'select-none opacity-0 blur-sm'
                        : 'opacity-100',
                    ].join(' ')}
                  >
                    {row.item.ar}
                    {row.item.context_eg ? (
                      <span className="mt-0.5 block text-xs font-normal text-v2-muted">
                        {row.item.context_eg}
                      </span>
                    ) : null}
                  </p>
                </button>
                <div className="mt-3 flex justify-start">
                  <button
                    type="button"
                    disabled={added.has(row.id) || adding === row.id}
                    onClick={() => void onAddCard(row.id)}
                    className="rounded-full border border-v2-action/40 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-action disabled:opacity-60"
                  >
                    {added.has(row.id) ? '✓ في الكروت' : '+ للكروت'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {tipBlock && tipBlock.type === 'tip' ? (
          <NoteCard>
            <p className="mb-1 font-semibold">
              <RichText segments={tipBlock.title as Rt} />
            </p>
            <RichText segments={tipBlock.body as Rt} />
          </NoteCard>
        ) : null}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[390px] bg-gradient-to-t from-v2-paper via-v2-paper to-transparent px-4 pb-6 pt-4">
        {nextHref ? (
          <Link
            href={nextHref}
            onClick={onNext}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)]"
          >
            التالي
          </Link>
        ) : (
          <PrimaryButton className="w-full" onClick={onNext}>
            التالي
          </PrimaryButton>
        )}
      </div>
    </main>
  );
}
