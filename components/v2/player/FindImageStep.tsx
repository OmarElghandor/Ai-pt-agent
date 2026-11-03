'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { RichText } from '@/components/v2/RichText';
import { TargetWord } from '@/components/v2/cards/TargetWord';
import type { FindImageRound } from '@/lib/v2/findImage/buildRounds';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';
import { markPageDone } from './session';
import { playSpeech } from './speech';

const EASTERN = '٠١٢٣٤٥٦٧٨٩';

function eastern(n: number): string {
  return String(n).replace(/\d/g, (d) => EASTERN[Number(d)]!);
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

function displayUrl(
  url: string | null,
  phraseLike: boolean,
): string | null {
  if (!url) return null;
  return (
    cloudinaryDisplayUrl(url, {
      aspect: phraseLike ? '4:3' : '1:1',
      width: 480,
    }) ?? url
  );
}

type Props = {
  day: number;
  rounds: FindImageRound[];
  situationEg?: string;
  titleTl?: string;
  nextHref: string;
};

export function FindImageStep({
  day,
  rounds,
  situationEg,
  titleTl,
  nextHref,
}: Props) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [solved, setSolved] = useState(false);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [scoredThisRound, setScoredThisRound] = useState(false);
  const [finished, setFinished] = useState(false);
  const autoplayed = useRef<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const total = rounds.length;
  const round = rounds[index] ?? null;
  const phraseLike = Boolean(round?.targetId.startsWith('phrase.'));

  function stopAudio() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  function playTarget(tl: string) {
    stopAudio();
    const ac = new AbortController();
    abortRef.current = ac;
    void playSpeech(tl, 'pt', ac.signal);
  }

  useEffect(() => {
    if (!round || finished) return;
    if (autoplayed.current.has(index)) return;
    autoplayed.current.add(index);
    playTarget(round.tl);
    return () => stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoplay once per round index
  }, [index, round?.targetId, finished]);

  function onPick(cardIndex: number) {
    if (!round || solved) return;
    const correct = cardIndex === round.correctIndex;
    const nextPicked = new Set(picked);
    nextPicked.add(cardIndex);
    setPicked(nextPicked);

    if (!scoredThisRound) {
      setScoredThisRound(true);
      if (correct) setFirstTryCorrect((n) => n + 1);
      postClosedAnswer({
        kind: 'closed',
        answer_id: newAnswerId(),
        day,
        skill: 'listening',
        option_index: cardIndex,
        correct_index: round.correctIndex,
        item_id: round.targetId,
        question_id: `find_image:${day}:${round.targetId}`,
        question_type: 'find_image',
      });
    }

    if (correct) {
      setSolved(true);
      stopAudio();
    }
  }

  function goNext() {
    if (!solved && !finished) return;
    if (index + 1 >= total) {
      markPageDone(day, 'find_image');
      setFinished(true);
      stopAudio();
      return;
    }
    setIndex((i) => i + 1);
    setPicked(new Set());
    setSolved(false);
    setScoredThisRound(false);
  }

  function finish() {
    markPageDone(day, 'find_image');
    router.push(nextHref);
  }

  if (finished || !round) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper px-4 pb-10 pt-4">
        <div className="flex items-center justify-between">
          <span className="rounded-v2-pill bg-v2-paper-deep px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-primary">
            ✓ خلّصت لاقي الصورة
          </span>
          <Link href={`/day/${day}`} className="text-v2-ink" aria-label="إغلاق">
            ✕
          </Link>
        </div>
        <div className="mt-6 rounded-v2-card bg-v2-primary px-5 py-8 text-center text-white shadow-[var(--shadow-v2-soft)]">
          <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl font-bold">
            لقيت {eastern(firstTryCorrect)} من {eastern(total)}
          </h1>
          <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-white/80">
            أول محاولة بس هي اللي بتحسب
          </p>
        </div>
        <div className="mt-8">
          <PrimaryButton className="w-full" onClick={finish}>
            كمّل
          </PrimaryButton>
        </div>
      </main>
    );
  }

  const progressLabel = `${eastern(index + 1)}/${eastern(total)}`;
  const dayPill = titleTl
    ? `Dia ${day} · ${titleTl}`
    : `Dia ${day}`;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper pb-8">
      <header className="sticky top-0 z-40 border-b border-v2-line/60 bg-v2-paper/90 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Link
            href={`/day/${day}`}
            aria-label="رجوع"
            className="flex h-10 w-10 items-center justify-center rounded-full text-v2-primary hover:bg-v2-primary/10"
          >
            <Icon name="arrow_forward" size={24} />
          </Link>
          <h1 className="font-[family-name:var(--font-v2-arabic)] text-xl font-bold tracking-tight text-v2-primary">
            لاقي الصورة
          </h1>
        </div>
      </header>

      <div className="flex flex-col gap-3.5 px-4 pt-3">
        <div className="space-y-3 rounded-2xl border border-v2-line bg-v2-paper-deep/80 p-3.5 shadow-[var(--shadow-v2-soft)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-v2-primary text-[12px] font-bold text-white shadow-sm">
                {progressLabel}
              </span>
              {situationEg ? (
                <span className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                  {situationEg}
                </span>
              ) : null}
            </div>
            <span className="rounded-full border border-v2-primary/15 bg-v2-primary/10 px-3 py-1 font-[family-name:var(--font-v2-target)] text-[12px] font-semibold text-v2-primary">
              {dayPill}
            </span>
          </div>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
          >
            {rounds.map((_, i) => {
              const done = i < index || (i === index && solved);
              const current = i === index && !solved;
              return (
                <div
                  key={i}
                  className={[
                    'h-2 rounded-full',
                    done
                      ? 'bg-v2-action'
                      : current
                        ? 'bg-v2-primary ring-2 ring-v2-primary/20'
                        : 'bg-v2-line',
                  ].join(' ')}
                />
              );
            })}
          </div>
        </div>

        <div className="relative flex flex-col items-center overflow-hidden rounded-2xl border border-v2-line bg-v2-card px-5 py-5 text-center shadow-[var(--shadow-v2-soft)]">
          <button
            type="button"
            aria-label="استمع لنطق الكلمة"
            onClick={() => playTarget(round.tl)}
            className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-v2-primary text-white shadow-[0_4px_12px_rgba(20,84,90,0.3)] active:scale-95"
          >
            <Icon name="volume_up" size={24} />
          </button>
          <div className="relative z-10 mt-3 flex flex-col items-center">
            <TargetWord tl={round.tl} gender={round.gender} size="xl" />
            <div className="mt-1.5 flex items-center gap-2">
              {round.say ? (
                <span className="font-[family-name:var(--font-v2-arabic)] text-lg font-semibold text-v2-ink">
                  {round.say}
                </span>
              ) : null}
              {round.say ? (
                <span className="h-1.5 w-1.5 rounded-full bg-v2-primary/30" />
              ) : null}
              <span className="font-[family-name:var(--font-v2-arabic)] text-[13px] font-medium text-v2-action">
                {round.tag}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => playTarget(round.tl)}
            className="relative z-10 mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-v2-line bg-v2-paper px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink-muted"
          >
            <Icon name="replay" size={20} className="text-v2-action" />
            دوس عشان تسمع تاني
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-1 text-v2-ink-muted">
          <Icon name="touch_app" size={20} className="text-v2-action" />
          <p className="font-[family-name:var(--font-v2-arabic)] text-[15px] font-semibold text-v2-primary">
            اسمع الكلمة واضغط على الصورة الصح
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {round.cards.map((card, i) => {
            const isPicked = picked.has(i);
            const isCorrect = i === round.correctIndex;
            const showCorrect = solved && isCorrect;
            const showWrong = isPicked && !isCorrect;
            const src = displayUrl(card.url, phraseLike);

            return (
              <button
                key={card.itemId}
                type="button"
                disabled={solved && !isCorrect}
                onClick={() => onPick(i)}
                className={[
                  'relative flex flex-col items-center overflow-hidden rounded-2xl bg-v2-card p-2.5 text-start transition-transform active:scale-[0.98]',
                  showCorrect
                    ? 'ring-2 ring-v2-primary shadow-[0_4px_16px_rgba(20,84,90,0.12)]'
                    : showWrong
                      ? 'ring-1 ring-v2-action/50 opacity-85'
                      : 'border border-v2-line shadow-sm',
                ].join(' ')}
              >
                {showCorrect ? (
                  <span className="absolute end-2.5 top-2.5 z-20 inline-flex items-center gap-1 rounded-full bg-v2-primary px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
                    <Icon name="check_circle" size={20} />
                    صح!
                  </span>
                ) : null}
                {showWrong ? (
                  <span className="absolute end-2.5 top-2.5 z-20 inline-flex items-center gap-0.5 rounded-full border border-v2-attention/40 bg-v2-paper-deep px-2 py-0.5 text-[11px] font-bold text-v2-attention">
                    <Icon name="close" size={20} />
                    مش دي
                  </span>
                ) : null}
                <div
                  className={[
                    'w-full overflow-hidden rounded-xl border border-v2-line',
                    showWrong ? 'grayscale-[20%]' : '',
                  ].join(' ')}
                >
                  <ImageSlot
                    variant={phraseLike ? 'flashcard' : 'thumb'}
                    src={src}
                    alt={card.tl}
                    fit="contain"
                    className={
                      phraseLike
                        ? 'max-h-none rounded-xl'
                        : 'rounded-xl'
                    }
                  />
                </div>
                {showCorrect || showWrong ? (
                  <div
                    className={[
                      'mt-2 flex w-full items-center justify-center gap-2 pt-1 text-center',
                      showWrong
                        ? 'text-v2-ink-muted line-through decoration-v2-attention'
                        : '',
                    ].join(' ')}
                  >
                    <span
                      dir="ltr"
                      className="font-[family-name:var(--font-v2-target)] text-[15px] font-semibold italic text-v2-action"
                    >
                      {card.tl}
                    </span>
                    <span className="text-[13px] text-v2-line">·</span>
                    <span
                      className={[
                        'font-[family-name:var(--font-v2-arabic)] text-[14px] font-bold',
                        showCorrect ? 'text-v2-primary' : '',
                      ].join(' ')}
                    >
                      {card.ar}
                    </span>
                  </div>
                ) : (
                  <div className="mt-2 h-5 w-full" aria-hidden />
                )}
              </button>
            );
          })}
        </div>

        {round.note && solved ? (
          <NoteCard>
            <p className="font-bold">ملاحظة سريعة في البرتغالي</p>
            <p className="mt-1 text-v2-ink/90">
              <RichText segments={round.note} />
            </p>
          </NoteCard>
        ) : null}

        <button
          type="button"
          disabled={!solved}
          onClick={goNext}
          className="flex h-13 w-full items-center justify-between rounded-xl bg-v2-action px-5 py-3.5 font-[family-name:var(--font-v2-arabic)] text-[16px] font-bold text-white shadow-[0_4px_14px_rgba(245,109,78,0.35)] disabled:opacity-50"
        >
          <span className="flex items-center gap-2">
            <span>{index + 1 >= total ? 'النتيجة' : 'السؤال التالي'}</span>
            <Icon name="arrow_back" size={20} />
          </span>
          <span className="rounded-lg bg-black/15 px-2.5 py-1 text-[12px] font-semibold">
            Dia {day} · {progressLabel.replace('/', ' / ')}
          </span>
        </button>
      </div>
    </main>
  );
}
