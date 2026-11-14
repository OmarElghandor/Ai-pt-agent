'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { TargetWord } from '@/components/v2/cards/TargetWord';
import { DemoImageGenerate } from '@/components/v2/DemoImageGenerate';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { NoteCard } from '@/components/v2/NoteCard';
import { RichText } from '@/components/v2/RichText';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { StoryDoc } from '@/lib/v2/content/story';
import type { Rt } from '@/lib/v2/content/rt';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';
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

function itemGender(item: Item | null | undefined): 'm' | 'f' | undefined {
  if (!item || !('gender' in item)) return undefined;
  const g = (item as { gender?: string }).gender;
  return g === 'm' || g === 'f' ? g : undefined;
}

function itemPlural(item: Item | null | undefined): string | null {
  if (!item || !('plural' in item)) return null;
  const p = (item as { plural?: string }).plural;
  return p?.trim() ? p : null;
}

function itemSay(item: Item | null | undefined): string | null {
  if (!item || !('say' in item)) return null;
  const s = (item as { say?: string }).say;
  return s?.trim() ? s : null;
}

function itemTag(item: Item | null | undefined): string | null {
  if (!item) return null;
  const tag = (item as { tag?: string }).tag?.trim();
  if (tag) return tag;
  const cat = (item as { category?: string }).category?.trim();
  return cat || null;
}

function itemContextEg(item: Item | null | undefined): string | null {
  if (!item || !('context_eg' in item)) return null;
  const c = (item as { context_eg?: string }).context_eg;
  return c?.trim() ? c : null;
}

/** Pull up to 2 TL example pairs from a tip body (wrong → right). */
function tipExampleRows(body: Rt | undefined): Array<{ wrong: string; right: string }> {
  if (!body?.length) return [];
  const tls = body
    .filter((s) => s.lang === 'tl' && s.text.trim())
    .map((s) => s.text.trim());
  if (tls.length >= 2) {
    return [{ wrong: tls[0]!, right: tls[1]! }];
  }
  return [];
}

type CheckMemory = {
  picked: number | null;
  solved: boolean;
  scored: boolean;
  readOnly: boolean;
};

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
      tips: tipBlocks.map((b, tipIndex) => ({
        tipIndex,
        afterItemId:
          b.type === 'tip' &&
          'after_item_id' in b &&
          typeof b.after_item_id === 'string'
            ? b.after_item_id
            : undefined,
      })),
    });
  }, [cardIds, items, story, tipBlocks]);

  const checkIndexes = useMemo(
    () =>
      slides
        .map((s, i) => (s.kind === 'micro_check' ? i : -1))
        .filter((i) => i >= 0),
    [slides],
  );

  const [index, setIndex] = useState(0);
  const [coverMeaning, setCoverMeaning] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [checkSolved, setCheckSolved] = useState(false);
  const [scoredCheck, setScoredCheck] = useState(false);
  const [flashItemId, setFlashItemId] = useState<string | null>(null);
  const [checkMemory, setCheckMemory] = useState<Record<number, CheckMemory>>(
    {},
  );
  const [wrongFirstIds, setWrongFirstIds] = useState<string[]>([]);
  const [pulseNext, setPulseNext] = useState(false);
  const [addedCards, setAddedCards] = useState<Set<string>>(() => new Set());
  const [addingCard, setAddingCard] = useState<string | null>(null);
  const pulseTimer = useRef<number | null>(null);

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

  const checkReadOnly =
    slide?.kind === 'micro_check' &&
    Boolean(checkMemory[index]?.readOnly || checkMemory[index]?.solved);

  useEffect(() => {
    setCoverSrc(itemImageUrl(item));
  }, [item]);

  useEffect(() => {
    const mem = checkMemory[index];
    if (slide?.kind === 'micro_check' && mem) {
      setPicked(mem.picked);
      setCheckSolved(mem.solved);
      setScoredCheck(mem.scored);
      setFlashItemId(null);
      return;
    }
    setPicked(null);
    setCheckSolved(false);
    setScoredCheck(false);
    setFlashItemId(null);
    setPulseNext(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore from checkMemory only on index change
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

  useEffect(() => {
    return () => {
      if (pulseTimer.current != null) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  function go(delta: number) {
    const next = index + delta;
    if (next < 0 || next >= slides.length) return;
    setIndex(next);
  }

  function rememberCheck(partial: Partial<CheckMemory>) {
    setCheckMemory((prev) => {
      const cur = prev[index] ?? {
        picked: null,
        solved: false,
        scored: false,
        readOnly: false,
      };
      return {
        ...prev,
        [index]: { ...cur, ...partial },
      };
    });
  }

  function triggerNextPulse() {
    setPulseNext(true);
    if (pulseTimer.current != null) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setPulseNext(false), 700);
  }

  function onCheckPick(optionIndex: number) {
    if (!slide || slide.kind !== 'micro_check') return;
    if (checkReadOnly || checkSolved) return;
    const correct = optionIndex === slide.correctIndex;
    setPicked(optionIndex);
    rememberCheck({ picked: optionIndex });

    if (!scoredCheck) {
      setScoredCheck(true);
      rememberCheck({ scored: true, picked: optionIndex });
      if (!correct) {
        setWrongFirstIds((prev) =>
          prev.includes(slide.itemId) ? prev : [...prev, slide.itemId].slice(0, 8),
        );
      }
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
      rememberCheck({
        picked: optionIndex,
        solved: true,
        scored: true,
        readOnly: true,
      });
      triggerNextPulse();
    } else {
      setFlashItemId(slide.itemId);
      window.setTimeout(() => setFlashItemId(null), 1200);
    }
  }

  function onSkipCheck() {
    if (!slide || slide.kind !== 'micro_check') return;
    rememberCheck({
      picked: picked,
      solved: true,
      scored: scoredCheck,
      readOnly: true,
    });
    setCheckSolved(true);
    go(1);
  }

  async function onAddCard(id: string) {
    if (addedCards.has(id) || addingCard) return;
    setAddingCard(id);
    try {
      const res = await fetch(`/api/v2/cards/${encodeURIComponent(id)}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      if (res.ok) {
        setAddedCards((prev) => new Set(prev).add(id));
      }
    } finally {
      setAddingCard(null);
    }
  }

  const finishedLast = index >= slides.length - 1 && slides.length > 0;
  const canAdvanceCheck =
    !slide ||
    slide.kind !== 'micro_check' ||
    checkSolved ||
    slide.checkType === 'say_it' ||
    checkReadOnly;

  if (!slides.length) return null;

  const showingHeroImage =
    slide?.kind === 'item' ||
    (slide?.kind === 'micro_check' && flashItemId) ||
    slide?.kind === 'phrase_in_use';

  const progressFill =
    slides.length > 1 ? (index / (slides.length - 1)) * 100 : 100;
  const progressLabel = `${eastern(Math.min(index + 1, slides.length))} / ${eastern(slides.length)}`;

  const watchItems = wrongFirstIds.slice(0, 2).map((id) => {
    const it = byId.get(id);
    return {
      id,
      tl: it && 'tl' in it ? String(it.tl) : id,
      ar: it && 'ar' in it ? String(it.ar) : '',
    };
  });

  const tipBlock =
    slide?.kind === 'tip' && tipBlocks[slide.tipIndex]?.type === 'tip'
      ? tipBlocks[slide.tipIndex]
      : null;
  const tipExamples =
    tipBlock && tipBlock.type === 'tip'
      ? tipExampleRows(tipBlock.body as Rt)
      : [];

  const isPhrase = item?.type === 'phrase';
  const isRw = slide?.kind === 'item' && Boolean(slide.realWorldTag);
  const meaningHidden = coverMeaning;

  return (
    <main
      dir="rtl"
      className="relative mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper text-v2-ink"
    >
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-v2-line/60 bg-v2-paper/90 px-3 backdrop-blur">
        <Link
          href={`/day/${day}`}
          aria-label="إغلاق"
          className="flex h-10 w-10 items-center justify-center rounded-full text-v2-ink hover:bg-v2-paper-deep"
        >
          <Icon name="close" size={24} />
        </Link>
        <span className="rounded-full bg-v2-primary px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] font-medium text-white">
          Dia {day} · الكلمات والجمل
        </span>
      </header>

      <div className="px-4 pb-2 pt-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            {progressLabel}
          </p>
        </div>
        <div className="relative h-1.5 w-full overflow-visible rounded-full bg-v2-paper-deep">
          <div
            className="absolute inset-y-0 right-0 rounded-full bg-v2-action transition-[width] duration-300"
            style={{ width: `${progressFill}%` }}
          />
          {checkIndexes.map((ci) => {
            const leftPct =
              slides.length > 1 ? (ci / (slides.length - 1)) * 100 : 0;
            const reached = index >= ci;
            return (
              <span
                key={ci}
                aria-hidden
                className={[
                  'absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border-2 border-v2-paper',
                  reached ? 'bg-v2-action' : 'bg-v2-sand',
                ].join(' ')}
                style={{ right: `calc(${leftPct}% - 5px)` }}
              />
            );
          })}
        </div>
      </div>

      <div className="relative mx-4 mt-1 h-[36vh] min-h-[180px] overflow-hidden rounded-v2-card bg-v2-paper-deep shadow-[var(--shadow-v2-soft)]">
        {showingHeroImage ? (
          <ImageSlot
            variant={isPhrase ? 'flashcard' : 'thumb'}
            src={coverSrc}
            fill
            fit="cover"
          />
        ) : (
          <div className="h-full w-full bg-v2-paper-deep" />
        )}
        {isPhrase && showingHeroImage ? (
          <>
            <div
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:var(--color-v2-hero-scrim)]/70 via-transparent to-transparent"
              aria-hidden
            />
            <span className="absolute bottom-3 right-3 rounded-full bg-[color:var(--color-v2-hero-scrim)]/80 px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] text-white">
              جملة
            </span>
          </>
        ) : null}
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
      </div>

      <section className="relative z-10 flex flex-1 flex-col px-4 pb-28 pt-4">
        {slide?.kind === 'tip' && tipBlock && tipBlock.type === 'tip' ? (
          <div className="space-y-3">
            <NoteCard>
              <p className="mb-1 font-semibold">
                <RichText segments={tipBlock.title as Rt} />
              </p>
              <RichText segments={tipBlock.body as Rt} />
            </NoteCard>
            {tipExamples.slice(0, 2).map((ex, i) => (
              <div
                key={i}
                className="rounded-v2-card border border-v2-line bg-white px-3 py-2"
              >
                <p
                  dir="ltr"
                  className="font-[family-name:var(--font-v2-target)] text-sm text-v2-attention line-through"
                >
                  {ex.wrong}
                </p>
                <p
                  dir="ltr"
                  className="mt-1 font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-success"
                >
                  {ex.right}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {slide?.kind === 'breather' ? (
          <div className="flex flex-col items-center gap-5 pt-4">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-v2-action/30 bg-v2-action-tint">
              <p className="text-center font-[family-name:var(--font-v2-arabic)] text-lg font-semibold text-v2-primary">
                {eastern(slide.seen)}
                <span className="mx-1 text-v2-ink-muted">من</span>
                {eastern(slide.total)}
              </p>
            </div>
            <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted">
              شفت دول · كمّل
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {slide.chipIds.map((id) => {
                const it = byId.get(id);
                const tl = it && 'tl' in it ? String(it.tl) : id;
                return (
                  <button
                    key={id}
                    type="button"
                    dir="ltr"
                    className="rounded-v2-pill border border-v2-line bg-white px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm shadow-[var(--shadow-v2-soft)]"
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

        {slide?.kind === 'end' ? (
          <div className="space-y-4 pt-2">
            <h2 className="font-[family-name:var(--font-v2-arabic)] text-xl font-semibold text-v2-primary">
              خلّصت الكلمات والجمل
            </h2>
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              {wrongFirstIds.length
                ? 'دول اللي غلطت فيهم أول مرة — راجعهم بسرعة.'
                : 'ماشي كويس. كمّل للقاعدة.'}
            </p>
            {watchItems.length ? (
              <ul className="space-y-2">
                {watchItems.map((w) => (
                  <li
                    key={w.id}
                    className="rounded-v2-card border border-v2-attention/40 bg-v2-note/40 px-3 py-2"
                  >
                    <p
                      dir="ltr"
                      className="font-[family-name:var(--font-v2-target)] font-semibold text-v2-primary"
                    >
                      {w.tl}
                    </p>
                    {w.ar ? (
                      <p className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                        {w.ar}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {slide?.kind === 'item' && item && 'tl' in item ? (
          <div className="space-y-3">
            {isRw ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-v2-primary-tint px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-primary">
                  بيقولوها كده
                </span>
                {itemTag(item) ? (
                  <span className="rounded-full bg-v2-paper-deep px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-primary">
                    {itemTag(item)}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <TargetWord
                tl={String(item.tl)}
                gender={itemGender(item)}
                size="xl"
              />
              <AudioButton
                text={String(item.tl)}
                lang="pt"
                showSlow
                label="اسمع"
              />
            </div>

            {itemSay(item) ? (
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                {itemSay(item)}
              </p>
            ) : null}

            {!isRw && item?.type === 'word' ? (
              <div className="flex flex-wrap gap-2">
                {itemGender(item) ? (
                  <span className="rounded-full bg-v2-paper-deep px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink">
                    {itemGender(item) === 'f' ? 'مؤنث' : 'مذكر'}
                  </span>
                ) : null}
                {itemPlural(item) ? (
                  <span
                    dir="ltr"
                    className="rounded-full bg-v2-paper-deep px-3 py-1 font-[family-name:var(--font-v2-target)] text-xs text-v2-ink"
                  >
                    {itemPlural(item)}
                  </span>
                ) : null}
              </div>
            ) : null}

            {isPhrase && !isRw && itemContextEg(item) ? (
              <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                {itemContextEg(item)}
              </p>
            ) : null}

            <div className="rounded-v2-card border border-v2-line bg-white p-3 shadow-[var(--shadow-v2-soft)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold">
                  المعنى
                </p>
                <button
                  type="button"
                  onClick={() => setCoverMeaning((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-v2-line px-2.5 py-1 font-[family-name:var(--font-v2-arabic)] text-[11px] text-v2-ink-muted"
                >
                  <Icon
                    name={coverMeaning ? 'visibility' : 'visibility_off'}
                    size={20}
                  />
                  {coverMeaning ? 'أظهر المعنى' : 'غطّي المعنى'}
                </button>
              </div>
              {'ar' in item ? (
                <p
                  className={[
                    'font-[family-name:var(--font-v2-arabic)] text-lg transition',
                    meaningHidden
                      ? 'select-none opacity-0 blur-sm'
                      : 'opacity-100',
                  ].join(' ')}
                >
                  {item.ar}
                </p>
              ) : null}
            </div>

            {isRw && itemContextEg(item) ? (
              <div className="rounded-v2-card border border-v2-note-border bg-v2-note/80 px-3 py-2">
                <p className="mb-0.5 font-[family-name:var(--font-v2-arabic)] text-xs font-bold text-v2-attention">
                  إمتى تقولها
                </p>
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
                  {itemContextEg(item)}
                </p>
              </div>
            ) : null}

            {isRw ? (
              <button
                type="button"
                disabled={addedCards.has(slide.itemId) || addingCard === slide.itemId}
                onClick={() => void onAddCard(slide.itemId)}
                className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action disabled:opacity-60"
              >
                {addedCards.has(slide.itemId)
                  ? '✓ في الكروت'
                  : '+ ضيفها للكروت'}
              </button>
            ) : null}

            {slide.storyContext ? (
              <div className="space-y-2 pt-1">
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                  من القصة · {slide.storyContext.speakerName}
                </p>
                <div className="flex items-start justify-between gap-2 rounded-v2-card border border-v2-line bg-v2-paper p-3">
                  <p
                    dir="ltr"
                    className="font-[family-name:var(--font-v2-target)] text-lg font-semibold text-v2-primary"
                  >
                    {slide.storyContext.tl}
                  </p>
                  <button
                    type="button"
                    aria-label="استمع للجملة من القصة"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-paper-deep text-v2-primary"
                    onClick={() =>
                      void playSpeech(
                        slide.storyContext!.tl,
                        'pt',
                        new AbortController().signal,
                      )
                    }
                  >
                    <Icon name="volume_up" size={20} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {slide?.kind === 'micro_check' ? (
          <div className="space-y-4">
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold tracking-wide text-v2-chrome-muted">
              سؤال سريع
            </p>
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
                <AudioButton text={slide.sayTl} lang="pt" label="اسمع" />
                <p
                  dir="ltr"
                  className="font-[family-name:var(--font-v2-target)] text-xl"
                >
                  {slide.sayTl}
                </p>
              </div>
            ) : null}
            {slide.checkType === 'pick_image' && slide.cue ? (
              <div className="flex justify-center">
                <AudioButton
                  text={slide.cue}
                  lang="pt"
                  showSlow
                  label="اسمع"
                />
              </div>
            ) : null}

            {flashItemId && !checkSolved ? (
              <div className="rounded-v2-card border border-v2-attention/50 bg-v2-note/60 p-3">
                <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-attention">
                  مش دي
                </p>
                {itemTl ? (
                  <p
                    dir="ltr"
                    className="mt-1 font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
                  >
                    {itemTl}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div
              className={
                slide.checkType === 'pick_image'
                  ? 'grid grid-cols-3 gap-2'
                  : slide.checkType === 'choose_article'
                    ? 'flex flex-wrap justify-center gap-3'
                    : 'flex flex-col gap-2'
              }
            >
              {slide.options.map((opt, oi) => {
                const isPicked = picked === oi;
                const isCorrect = oi === slide.correctIndex;
                const showResult = picked != null;
                let tone =
                  'border-v2-line bg-white hover:border-v2-primary/40';
                let badge: string | null = null;
                if (showResult && isCorrect) {
                  tone = 'border-v2-success bg-v2-action-tint';
                  badge = 'صح!';
                } else if (showResult && isPicked && !isCorrect) {
                  tone = 'border-v2-attention bg-v2-note/70 opacity-70';
                  badge = 'مش دي';
                } else if (showResult && !isPicked && isCorrect) {
                  tone = 'border-v2-success/60 bg-white';
                  badge = 'صح كانت دي';
                } else if (showResult && !isCorrect) {
                  tone = 'border-v2-line bg-white opacity-40';
                }

                const disabled = checkReadOnly || checkSolved;

                if (slide.checkType === 'pick_image') {
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onCheckPick(oi)}
                      className={`relative overflow-hidden rounded-v2-card border-2 ${tone}`}
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
                      {badge ? (
                        <span className="absolute bottom-1 left-1 rounded-full bg-white/95 px-1.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-ink">
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                }

                if (slide.checkType === 'choose_article') {
                  const artClass = /^(a|as|uma)$/i.test(opt.label)
                    ? 'text-v2-group-f'
                    : 'text-v2-group-m';
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onCheckPick(oi)}
                      className={`flex h-16 min-w-[4.5rem] items-center justify-center rounded-v2-card border-2 px-5 ${tone}`}
                    >
                      <span
                        dir="ltr"
                        className={`font-[family-name:var(--font-v2-target)] text-2xl font-bold ${artClass}`}
                      >
                        {opt.label}
                      </span>
                    </button>
                  );
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={disabled && slide.checkType !== 'say_it'}
                    onClick={() => {
                      onCheckPick(oi);
                      if (slide.checkType === 'say_it') {
                        setCheckSolved(true);
                        rememberCheck({
                          picked: oi,
                          solved: true,
                          scored: true,
                          readOnly: true,
                        });
                        triggerNextPulse();
                      }
                    }}
                    className={`rounded-v2-card border-2 px-4 py-3 text-start font-[family-name:var(--font-v2-arabic)] text-base ${tone}`}
                    dir={
                      slide.checkType === 'pick_tl' ||
                      slide.checkType === 'complete_phrase'
                        ? 'ltr'
                        : 'rtl'
                    }
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{opt.label}</span>
                      {badge ? (
                        <span className="shrink-0 text-xs font-semibold">
                          {badge}
                        </span>
                      ) : null}
                    </span>
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
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[390px] border-t border-v2-tab-border bg-v2-tab-bar/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {slide?.kind === 'micro_check' && !checkSolved && !checkReadOnly ? (
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={onSkipCheck}
              className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-chrome-muted underline-offset-2 hover:underline"
            >
              تخطّى
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {slide?.kind === 'end' && nextHref ? (
            <Link
              href={nextHref}
              onClick={() => markPageDone(day, page.id)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)]"
            >
              كمّل للقاعدة
            </Link>
          ) : slide?.kind === 'end' ? (
            <button
              type="button"
              onClick={() => markPageDone(day, page.id)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white"
            >
              كمّل للقاعدة
            </button>
          ) : (
            <button
              type="button"
              disabled={finishedLast || !canAdvanceCheck}
              onClick={() => {
                if (!canAdvanceCheck || finishedLast) return;
                go(1);
              }}
              className={[
                'inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-40',
                pulseNext ? 'v2-next-pulse-once' : '',
              ].join(' ')}
            >
              التالي
            </button>
          )}
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(-1)}
            className="inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-v2-chip border border-v2-primary bg-white px-4 py-2.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary disabled:opacity-40"
          >
            السابق
          </button>
        </div>
      </nav>
    </main>
  );
}
