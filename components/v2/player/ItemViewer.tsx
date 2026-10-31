'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ImageSlot } from '@/components/v2/ImageSlot';
import type { Block } from '@/lib/v2/content/blocks';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
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
  /** Story dialogue lines for "من القصة" examples. */
  storyLines?: { speaker: string; tl: string; ar?: string; ids?: string[] }[];
};

function collectCardIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === 'cards') ids.push(...b.items);
  }
  return [...new Set(ids)];
}

function storyExample(
  itemId: string,
  storyLines: Props['storyLines'],
  items: Item[],
): { tl: string; ar?: string; speaker?: string } | null {
  if (storyLines?.length) {
    for (const line of storyLines) {
      if (line.ids?.includes(itemId) || line.tl.includes(
        (items.find((i) => i.id === itemId) as { tl?: string } | undefined)?.tl?.replace(
          /^(o|a|os|as)\s+/i,
          '',
        ) ?? '__none__',
      )) {
        return { tl: line.tl, ar: line.ar, speaker: line.speaker };
      }
    }
  }
  const item = items.find((i) => i.id === itemId);
  if (item && 'example' in item && typeof item.example === 'string' && item.example) {
    const ex = items.find((i) => i.id === item.example);
    if (ex && 'tl' in ex) {
      return { tl: String(ex.tl), ar: 'ar' in ex ? String(ex.ar) : undefined };
    }
    return { tl: item.example };
  }
  return null;
}

export function ItemViewer({
  day,
  page,
  items,
  situationEg,
  titleTl,
  nextHref = null,
  storyLines = [],
}: Props) {
  const ids = useMemo(() => collectCardIds(page.blocks), [page.blocks]);
  const tipBlocks = page.blocks.filter((b) => b.type === 'tip');
  const slides = ids.length + (tipBlocks.length ? 1 : 0);
  const [index, setIndex] = useState(0);
  const [memory, setMemory] = useState(page.cover === 'meaning');
  const [showMeaning, setShowMeaning] = useState(!memory);

  const onTipSlide = tipBlocks.length > 0 && index >= ids.length;
  const itemId = !onTipSlide ? ids[index] : null;
  const item = itemId ? items.find((i) => i.id === itemId) : null;
  const example = itemId ? storyExample(itemId, storyLines, items) : null;

  function go(delta: number) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= slides) {
      markPageDone(day, page.id);
      return;
    }
    setIndex(next);
    setShowMeaning(!memory);
  }

  const finishedLast =
    index >= slides - 1 && slides > 0;

  if (!ids.length) {
    return null;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-v2-paper">
      <div className="relative h-[55vh] min-h-[240px] w-full overflow-hidden">
        <ImageSlot variant="cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/40" />
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
          <Link
            href={`/day/${day}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
          >
            →
          </Link>
          <div className="text-end text-white">
            <p className="font-[family-name:var(--font-v2-ui)] text-[11px]">
              DIA {day}
              {titleTl ? ` · ${titleTl}` : ''}
            </p>
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
              {plainRt(page.title)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setMemory((m) => !m);
              setShowMeaning((s) => (memory ? true : false));
            }}
            className="rounded-full bg-black/30 px-2 py-2 text-[11px] text-white"
          >
            نمط الحفظ
          </button>
        </header>
        {situationEg ? (
          <p className="absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-white">
            {situationEg}
          </p>
        ) : null}
        <div className="absolute inset-x-0 bottom-8 z-10 flex items-center justify-between px-2">
          <button
            type="button"
            aria-label="التالي"
            onClick={() => go(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-primary text-white"
          >
            ‹
          </button>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-white">
            {Math.min(index + 1, slides)} من {slides}
          </p>
          <button
            type="button"
            aria-label="السابق"
            onClick={() => go(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-v2-primary"
          >
            ›
          </button>
        </div>
      </div>

      <section className="relative z-20 -mt-4 flex flex-1 flex-col rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-[var(--shadow-v2-soft)]">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-v2-rule" />
        {onTipSlide ? (
          <div className="space-y-3">
            {tipBlocks.map((t) =>
              t.type === 'tip' ? (
                <div key={t.id} className="rounded-v2-card bg-v2-note p-4">
                  <p className="font-[family-name:var(--font-v2-arabic)] text-base">
                    {plainRt(t.body)}
                  </p>
                </div>
              ) : null,
            )}
          </div>
        ) : item && 'tl' in item ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <p
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] text-3xl font-semibold text-v2-primary"
              >
                {item.tl}
              </p>
              <button
                type="button"
                className="rounded-full border border-v2-line px-3 py-1 text-xs"
                onClick={() => void playSpeech(String(item.tl), 'pt', undefined, 0.75)}
              >
                بطيء
              </button>
            </div>
            {'say' in item && item.say ? (
              <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                {item.say}
                {item.type === 'word' && item.gender
                  ? item.gender === 'm'
                    ? ' · مذكر'
                    : ' · مؤنث'
                  : ''}
              </p>
            ) : null}

            <div className="mt-4 rounded-v2-card border border-v2-line p-3">
              <div className="flex items-center justify-between">
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold">
                  المعنى
                </p>
                <button
                  type="button"
                  className="text-xs text-v2-primary"
                  onClick={() => setShowMeaning((s) => !s)}
                >
                  {showMeaning ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
              {showMeaning && 'ar' in item ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-lg">
                  {item.ar}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowMeaning(true)}
                  className="mt-2 w-full rounded-lg bg-v2-paper py-6 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted"
                >
                  المس عشان تشوف المعنى
                </button>
              )}
            </div>

            {example ? (
              <div className="mt-3 rounded-v2-card border border-v2-line p-3">
                <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                  {example.speaker ? `من القصة · ${example.speaker}` : 'مثال'}
                </p>
                <p
                  dir="ltr"
                  className="mt-1 font-[family-name:var(--font-v2-target)] text-base"
                >
                  {example.tl}
                </p>
                {!memory && example.ar ? (
                  <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                    {example.ar}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-6">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-primary disabled:opacity-40"
          >
            السابق
          </button>
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            الصفحة {index + 1} من {slides}
          </p>
          {finishedLast && nextHref ? (
            <Link
              href={nextHref}
              onClick={() => markPageDone(day, page.id)}
              className="rounded-full bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-white"
            >
              التالي
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (finishedLast) markPageDone(day, page.id);
                go(1);
              }}
              className="rounded-full bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-white"
            >
              التالي
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
