'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DemoImageGenerate } from '@/components/v2/DemoImageGenerate';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import type { Block } from '@/lib/v2/content/blocks';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';
import { plainRt } from '@/lib/v2/render/speechTarget';
import { playSpeech } from './speech';
import { markPageDone } from './session';

function itemAspect(item: Item | null | undefined): '1:1' | '4:3' {
  return item?.type === 'phrase' ? '4:3' : '1:1';
}

function itemImageUrl(item: Item | null | undefined): string | null {
  if (!item) return null;
  const aspect = itemAspect(item);
  const any = item as {
    image?: { url?: string };
    media?: { image?: string };
  };
  if (any.image?.url) {
    return cloudinaryDisplayUrl(any.image.url, { aspect, width: 900 });
  }
  if (typeof any.media?.image === 'string' && any.media.image.startsWith('http')) {
    return cloudinaryDisplayUrl(any.media.image, { aspect, width: 900 });
  }
  if (typeof any.media?.image === 'string' && any.media.image.startsWith('/')) {
    return any.media.image;
  }
  return null;
}

type Props = {
  day: number;
  page: Page;
  items: Item[];
  situationEg?: string;
  titleTl?: string;
  nextHref?: string | null;
};

function collectCardIds(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === 'cards') ids.push(...b.items);
  }
  return [...new Set(ids)];
}

export function ItemViewer({
  day,
  page,
  items,
  situationEg,
  titleTl,
  nextHref = null,
}: Props) {
  const ids = useMemo(() => collectCardIds(page.blocks), [page.blocks]);
  const tipBlocks = page.blocks.filter((b) => b.type === 'tip');
  const slides = ids.length + (tipBlocks.length ? 1 : 0);
  const [index, setIndex] = useState(0);
  const [memory, setMemory] = useState(false);

  const onTipSlide = tipBlocks.length > 0 && index >= ids.length;
  const itemId = !onTipSlide ? ids[index] : null;
  const item = itemId ? items.find((i) => i.id === itemId) : null;
  const itemTl = item && 'tl' in item ? String(item.tl) : null;
  const [coverSrc, setCoverSrc] = useState<string | null>(itemImageUrl(item));
  useEffect(() => {
    setCoverSrc(itemImageUrl(item));
  }, [item]);

  useEffect(() => {
    if (!itemTl) return;
    const ctrl = new AbortController();
    void playSpeech(itemTl, 'pt', ctrl.signal);
    return () => ctrl.abort();
  }, [itemId, itemTl]);

  function go(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= slides) return;
    setIndex(next);
  }

  const finishedLast = index >= slides - 1 && slides > 0;
  const heroVariant = item?.type === 'phrase' ? 'flashcard' : 'thumb';
  const heroAspect = itemAspect(item);
  const exitClass =
    'flex h-12 w-12 items-center justify-center rounded-full bg-v2-action text-white ring-4 ring-v2-action/30 shadow-[var(--shadow-v2-soft)]';

  if (!ids.length) {
    return null;
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-v2-paper">
      <div className="relative h-[55vh] min-h-[280px] w-full overflow-hidden">
        <ImageSlot
          variant={heroVariant}
          src={coverSrc}
          fill
          fit="cover"
        />
        {!onTipSlide && itemId ? (
          <DemoImageGenerate
            body={{ kind: 'item', day, item_id: itemId }}
            label={coverSrc ? 'Regenerate' : 'Generate'}
            onReady={(url) =>
              setCoverSrc(
                cloudinaryDisplayUrl(url, {
                  aspect: heroAspect,
                  width: 900,
                }),
              )
            }
          />
        ) : null}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-black/25 to-transparent"
          aria-hidden
        />
        <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 pt-3">
          <Link
            href={`/day/${day}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white"
          >
            →
          </Link>
          <div className="text-end text-white drop-shadow">
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
            onClick={() => setMemory((m) => !m)}
            className="rounded-full bg-black/30 px-2 py-2 text-[11px] text-white"
          >
            نمط الحفظ
          </button>
        </header>
        {situationEg ? (
          <p className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-white">
            {situationEg}
          </p>
        ) : null}
      </div>

      <div className="relative z-10 flex items-center justify-between px-2 py-3">
        <button
          type="button"
          aria-label="التالي"
          onClick={() => go(1)}
          disabled={finishedLast}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-primary text-white disabled:opacity-40"
        >
          ‹
        </button>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {Math.min(index + 1, slides)} من {slides}
        </p>
        <button
          type="button"
          aria-label="السابق"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-v2-line bg-white text-v2-primary disabled:opacity-40"
        >
          ›
        </button>
      </div>

      <section className="relative z-20 flex flex-1 flex-col rounded-t-3xl bg-white px-4 pb-6 pt-4 shadow-[var(--shadow-v2-soft)]">
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
                aria-label="تشغيل"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-v2-line bg-white text-v2-primary"
                onClick={() =>
                  void playSpeech(String(item.tl), 'pt', new AbortController().signal)
                }
              >
                <Icon name="volume_up" size={24} />
              </button>
            </div>

            <div className="mt-4 rounded-v2-card border border-v2-line p-3">
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold">
                المعنى
              </p>
              {'ar' in item ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-lg">
                  {memory ? 'المس عشان تشوف المعنى' : item.ar}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <div className="mt-auto flex flex-col items-center pt-6">
          {finishedLast && nextHref ? (
            <Link
              href={nextHref}
              onClick={() => markPageDone(day, page.id)}
              aria-label="الجزء التالي"
              className={exitClass}
            >
              <Icon name="expand_more" size={32} />
            </Link>
          ) : finishedLast ? (
            <button
              type="button"
              aria-label="الجزء التالي"
              onClick={() => markPageDone(day, page.id)}
              className={exitClass}
            >
              <Icon name="expand_more" size={32} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="الجزء التالي"
              disabled
              className="flex h-12 w-12 items-center justify-center rounded-full bg-v2-action text-white opacity-40"
            >
              <Icon name="expand_more" size={32} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
