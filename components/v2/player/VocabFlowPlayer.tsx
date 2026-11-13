'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DemoImageGenerate } from '@/components/v2/DemoImageGenerate';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { StoryDoc } from '@/lib/v2/content/story';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';
import { plainRt } from '@/lib/v2/render/speechTarget';
import {
  buildVocabFlow,
  collectVocabCardIds,
  type VocabFlowSlide,
} from '@/lib/v2/vocabFlow';
import { markPageDone } from './session';
import { playSpeech } from './speech';

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

function eastern(n: number): string {
  const map = '٠١٢٣٤٥٦٧٨٩';
  return String(n).replace(/\d/g, (d) => map[Number(d)]!);
}

function newAnswerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mc_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function postClosedAnswer(body: Record<string, unknown>): void {
  void fetch('/api/v2/answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timezone':
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC',
    },
    body: JSON.stringify(body),
  }).catch(() => {});
}

type Props = {
  day: number;
  page: Page;
  items: Item[];
  situationEg?: string;
  titleTl?: string;
  nextHref?: string | null;
  story?: StoryDoc | null;
};

export function VocabFlowPlayer({
  day,
  page,
  items,
  situationEg,
  titleTl,
  nextHref = null,
  story = null,
}: Props) {
  const tipBlocks = page.blocks.filter((b) => b.type === 'tip');
  const cardIds = useMemo(
    () => collectVocabCardIds(page.blocks),
    [page.blocks],
  );

  const slides = useMemo(() => {
    const storyLines =
      story?.lines?.map((line, index) => ({
        index,
        speaker: line.speaker,
        tl: line.tl,
        ids: line.ids ?? undefined,
        ar: line.ar ?? undefined,
      })) ?? [];
    return buildVocabFlow({
      itemIds: cardIds,
      items,
      storyLines,
      cast:
        story?.cast?.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })) ?? [],
      tipCount: tipBlocks.length,
    });
  }, [cardIds, items, story, tipBlocks.length]);

  const [index, setIndex] = useState(0);
  const [memory, setMemory] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [checkSolved, setCheckSolved] = useState(false);
  const [scoredCheck, setScoredCheck] = useState(false);
  const [flashItemId, setFlashItemId] = useState<string | null>(null);

  const slide: VocabFlowSlide | null = slides[index] ?? null;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const itemId =
    slide?.kind === 'item'
      ? slide.itemId
      : slide?.kind === 'phrase_in_use'
        ? slide.itemId
        : flashItemId;
  const item = itemId ? byId.get(itemId) ?? null : null;
  const itemTl = item && 'tl' in item ? String(item.tl) : null;
  const [coverSrc, setCoverSrc] = useState<string | null>(itemImageUrl(item));

  useEffect(() => {
    setCoverSrc(itemImageUrl(item));
  }, [item]);

  useEffect(() => {
    setPicked(null);
    setCheckSolved(false);
    setScoredCheck(false);
    setFlashItemId(null);
  }, [index]);

  useEffect(() => {
    if (slide?.kind !== 'item' || !itemTl) return;
    const ctrl = new AbortController();
    void playSpeech(itemTl, 'pt', ctrl.signal);
    return () => ctrl.abort();
  }, [slide, itemTl, index]);

  useEffect(() => {
    if (slide?.kind !== 'micro_check' || slide.checkType !== 'pick_image') return;
    if (!slide.cue) return;
    const ctrl = new AbortController();
    void playSpeech(slide.cue, 'pt', ctrl.signal);
    return () => ctrl.abort();
  }, [slide, index]);

  function go(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= slides.length) return;
    setIndex(next);
  }

  function onCheckPick(optionIndex: number) {
    if (!slide || slide.kind !== 'micro_check' || checkSolved) return;
    const correct = optionIndex === slide.correctIndex;
    setPicked(optionIndex);

    if (!scoredCheck) {
      setScoredCheck(true);
      if (!slide.skipSrs) {
        postClosedAnswer({
          kind: 'closed',
          answer_id: newAnswerId(),
          day,
          skill: slide.skill,
          option_index: optionIndex,
          correct_index: slide.correctIndex,
          item_id: slide.itemId,
          question_id: `micro_check:${day}:${slide.itemId}:${slide.checkType}`,
          question_type: 'micro_check',
        });
      }
    }

    if (correct) {
      setCheckSolved(true);
      setFlashItemId(null);
    } else {
      setFlashItemId(slide.itemId);
      window.setTimeout(() => setFlashItemId(null), 1200);
    }
  }

  const finishedLast = index >= slides.length - 1 && slides.length > 0;
  const canAdvanceCheck =
    !slide ||
    slide.kind !== 'micro_check' ||
    checkSolved ||
    slide.checkType === 'say_it';
  const exitClass =
    'flex h-12 w-12 items-center justify-center rounded-full bg-v2-action text-white ring-4 ring-v2-action/30 shadow-[var(--shadow-v2-soft)]';

  if (!slides.length) return null;

  const showingItemChrome =
    slide?.kind === 'item' ||
    (slide?.kind === 'micro_check' && flashItemId) ||
    slide?.kind === 'phrase_in_use';

  return (
    <main className="relative flex min-h-dvh flex-col bg-v2-paper">
      <div className="relative h-[42vh] min-h-[220px] w-full overflow-hidden">
        {showingItemChrome ? (
          <ImageSlot
            variant={item?.type === 'phrase' ? 'flashcard' : 'thumb'}
            src={coverSrc}
            fill
            fit="cover"
          />
        ) : (
          <div className="h-full w-full bg-v2-paper-deep" />
        )}
        {slide?.kind === 'item' && itemId ? (
          <DemoImageGenerate
            body={{ kind: 'item', day, item_id: itemId }}
            label={coverSrc ? 'Regenerate' : 'Generate'}
            onReady={(url) =>
              setCoverSrc(
                cloudinaryDisplayUrl(url, {
                  aspect: itemAspect(item),
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
          onClick={() => {
            if (!canAdvanceCheck) return;
            go(1);
          }}
          disabled={finishedLast || !canAdvanceCheck}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-primary text-white disabled:opacity-40"
        >
          ‹
        </button>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {Math.min(index + 1, slides.length)} من {slides.length}
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

        {slide?.kind === 'tip' ? (
          <div className="space-y-3">
            {tipBlocks[slide.tipIndex]?.type === 'tip' ? (
              <div className="rounded-v2-card bg-v2-note p-4">
                <p className="font-[family-name:var(--font-v2-arabic)] text-base">
                  {plainRt(tipBlocks[slide.tipIndex]!.body)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {slide?.kind === 'breather' ? (
          <div className="space-y-4">
            <h2 className="font-[family-name:var(--font-v2-arabic)] text-xl font-semibold text-v2-primary">
              شفت {eastern(slide.seen)} من {eastern(slide.total)} · كمّل
            </h2>
            <div className="flex flex-wrap gap-2">
              {slide.chipIds.map((id) => {
                const it = byId.get(id);
                const tl = it && 'tl' in it ? String(it.tl) : id;
                return (
                  <button
                    key={id}
                    type="button"
                    dir="ltr"
                    className="rounded-v2-pill border border-v2-line bg-v2-paper px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm"
                    onClick={() =>
                      void playSpeech(tl, 'pt', new AbortController().signal)
                    }
                  >
                    {tl}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {slide?.kind === 'phrase_in_use' ? (
          <div className="space-y-3">
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              من القصة · {slide.speakerName}
            </p>
            <div className="rounded-v2-card border border-v2-line bg-v2-paper p-4">
              <div className="flex items-start justify-between gap-2">
                <p
                  dir="ltr"
                  className="font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
                >
                  {slide.tl}
                </p>
                <button
                  type="button"
                  aria-label="تشغيل"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-v2-line bg-white text-v2-primary"
                  onClick={() =>
                    void playSpeech(slide.tl, 'pt', new AbortController().signal)
                  }
                >
                  <Icon name="volume_up" size={24} />
                </button>
              </div>
              {slide.ar && !memory ? (
                <p className="mt-3 font-[family-name:var(--font-v2-arabic)] text-base">
                  {slide.ar}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {slide?.kind === 'item' && item && 'tl' in item ? (
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
                  void playSpeech(
                    String(item.tl),
                    'pt',
                    new AbortController().signal,
                  )
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

        {slide?.kind === 'micro_check' ? (
          <div className="space-y-4">
            <p className="font-[family-name:var(--font-v2-arabic)] text-lg font-semibold text-v2-primary">
              {slide.promptEg}
            </p>
            {slide.cue ? (
              <p
                dir={slide.checkType === 'pick_tl' ? 'rtl' : 'ltr'}
                className="font-[family-name:var(--font-v2-target)] text-2xl font-semibold"
              >
                {slide.cue}
              </p>
            ) : null}
            {slide.checkType === 'say_it' && slide.sayTl ? (
              <div className="space-y-3">
                <button
                  type="button"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-v2-line bg-white text-v2-primary"
                  onClick={() =>
                    void playSpeech(
                      slide.sayTl!,
                      'pt',
                      new AbortController().signal,
                    )
                  }
                >
                  <Icon name="volume_up" size={24} />
                </button>
                <p
                  dir="ltr"
                  className="font-[family-name:var(--font-v2-target)] text-xl"
                >
                  {slide.sayTl}
                </p>
              </div>
            ) : null}

            {flashItemId && !checkSolved ? (
              <div className="rounded-v2-card border border-amber-300 bg-amber-50 p-3">
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-900">
                  شوف تاني: {itemTl}
                </p>
              </div>
            ) : null}

            <div
              className={
                slide.checkType === 'pick_image'
                  ? 'grid grid-cols-3 gap-2'
                  : 'flex flex-col gap-2'
              }
            >
              {slide.options.map((opt, oi) => {
                const isPicked = picked === oi;
                const isCorrect = oi === slide.correctIndex;
                const showResult = picked != null;
                let tone =
                  'border-v2-line bg-white hover:border-v2-primary/40';
                if (showResult && isCorrect) {
                  tone = 'border-emerald-400 bg-emerald-50';
                } else if (showResult && isPicked && !isCorrect) {
                  tone = 'border-amber-400 bg-amber-50';
                }
                if (slide.checkType === 'pick_image') {
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={checkSolved}
                      onClick={() => onCheckPick(oi)}
                      className={`overflow-hidden rounded-v2-card border ${tone}`}
                    >
                      <div className="relative aspect-square w-full">
                        <ImageSlot
                          variant="thumb"
                          src={
                            opt.url
                              ? cloudinaryDisplayUrl(opt.url, {
                                  aspect: '1:1',
                                  width: 320,
                                })
                              : null
                          }
                          fill
                          fit="cover"
                        />
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={checkSolved && slide.checkType !== 'say_it'}
                    onClick={() => {
                      onCheckPick(oi);
                      if (slide.checkType === 'say_it') setCheckSolved(true);
                    }}
                    className={`rounded-v2-card border px-4 py-3 text-start font-[family-name:var(--font-v2-arabic)] text-base ${tone}`}
                    dir={
                      slide.checkType === 'pick_tl' ||
                      slide.checkType === 'complete_phrase' ||
                      slide.checkType === 'choose_article'
                        ? 'ltr'
                        : 'rtl'
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {checkSolved ? (
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                {slide.whyEg}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col items-center pt-6">
          {finishedLast && nextHref && canAdvanceCheck ? (
            <Link
              href={nextHref}
              onClick={() => markPageDone(day, page.id)}
              aria-label="الجزء التالي"
              className={exitClass}
            >
              <Icon name="expand_more" size={32} />
            </Link>
          ) : finishedLast && canAdvanceCheck ? (
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
              disabled={!canAdvanceCheck || finishedLast}
              onClick={() => {
                if (!canAdvanceCheck) return;
                go(1);
              }}
              className={`flex h-12 w-12 items-center justify-center rounded-full bg-v2-action text-white ${
                canAdvanceCheck && !finishedLast ? '' : 'opacity-40'
              }`}
            >
              <Icon name="expand_more" size={32} />
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
