'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BlockChromeProvider, type BlockChrome } from '@/components/v2/blocks/chrome';
import { BlockView } from '@/components/v2/blocks/BlockView';
import { QuestionCard } from '@/components/v2/blocks/QuestionCard';
import { CaptionBar } from '@/components/v2/CaptionBar';
import { RichText } from '@/components/v2/RichText';
import { SecondaryButton } from '@/components/v2/SecondaryButton';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import type { Rt, RtSegment } from '@/lib/v2/content/rt';
import { applySwap, completedControlIds, lockedBlockIds } from '@/lib/v2/render/explore';
import type { FormView } from '@/lib/v2/render/forms';
import { chapterFill, chapterSpans, guidedPartVisibility, type PartVisibility } from '@/lib/v2/render/guided';
import { itemTargetText, targetSpeech } from '@/lib/v2/render/speechTarget';
import { formatDayLabel } from '@/lib/v2/render/dayMinutes';
import { nextSpeed } from '@/lib/v2/render/timing';
import { SpeakerIcon } from '@/components/v2/AudioButton';
import { playSpeech } from './speech';
import { markPageDone, postPageAnswer } from './session';
import { useGuidedPlayback } from './useGuidedPlayback';

type Props = {
  day: number;
  page: Page;
  items: Item[];
  questions: Question[];
  forms: Record<string, FormView>;
  /** In-page demo: dock stays inside the frame instead of the viewport. */
  embedded?: boolean;
};

export function PagePlayer({ day, page, items, questions, forms, embedded = false }: Props) {
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const steps = page.steps ?? [];
  const [speed, setSpeed] = useState(1);
  const [coverOn, setCoverOn] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [seen, setSeen] = useState<Record<string, number[]>>({});
  const [activeChoice, setActiveChoice] = useState<{ controlId: string; index: number } | null>(null);
  const [fresh, setFresh] = useState<{ controlId: string; index: number } | null>(null);
  const [lemmas, setLemmas] = useState<Record<string, string>>({});
  const [pad, setPad] = useState(168);
  const dockRef = useRef<HTMLDivElement>(null);

  const guided = useGuidedPlayback({
    enabled: page.mode === 'guided',
    steps,
    speed,
    playTip: (text, signal) => playSpeech(text, 'ar', signal, speed),
    playTarget: async (target, signal) => {
      const line = targetSpeech(page, target, itemMap, forms);
      if (line) await playSpeech(line, 'pt', signal, speed);
    },
    onAnswered: (stepIndex, optionIndex) => {
      postPageAnswer({
        kind: 'page_ask',
        day,
        page_id: page.id,
        step_index: stepIndex,
        option_index: optionIndex,
      });
    },
  });

  const completed = useMemo(() => completedControlIds(page, seen), [page, seen]);
  const locked = useMemo(() => lockedBlockIds(page, completed), [page, completed]);
  const exploreDone = exploreReady(page, completed);
  const pageComplete =
    page.mode === 'static' ||
    (page.mode === 'guided' ? guided.phase === 'done' : exploreDone);
  const cover = pageComplete && coverOn ? (page.cover ?? null) : null;

  useEffect(() => {
    if (embedded || !pageComplete) return;
    markPageDone(day, page.id);
  }, [embedded, pageComplete, day, page.id]);

  useEffect(() => {
    const node = dockRef.current;
    if (!node) return;
    const apply = () => setPad(node.offsetHeight + 16);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [page.mode, guided.phase, quizOpen]);

  useEffect(() => {
    if (page.mode !== 'guided' || !guided.activeTarget) return;
    const node = document.querySelector(
      `[data-target="${CSS.escape(guided.activeTarget)}"]`,
    );
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [page.mode, guided.activeTarget]);

  const chapters = useMemo(
    () => chapterFill(chapterSpans(steps), guided.index, guided.phase === 'done'),
    [steps, guided.index, guided.phase],
  );

  function partState(blockId: string, part: string | null): PartVisibility {
    if (page.mode === 'static') return 'shown';
    if (page.mode === 'explore') return explorePartState(page, blockId, part, seen, activeChoice);
    return guidedPartVisibility(blockId, part, guided.revealedSet, guided.activeTarget);
  }

  function chooseAxis(controlId: string, index: number) {
    setSeen((prev) => {
      const current = prev[controlId] ?? [];
      if (current.includes(index)) return prev;
      return { ...prev, [controlId]: [...current, index] };
    });
    setActiveChoice({ controlId, index });
    setFresh({ controlId, index });
    const control = page.controls?.find((entry) => entry.id === controlId);
    if (!control || control.type !== 'reveal_axis') return;
    const line = axisSpeech(page, control.target, control.axis, index, itemMap, forms, lemmas);
    if (!line) return;
    const ctrl = new AbortController();
    void playSpeech(line, 'pt', ctrl.signal, speed);
  }

  function chooseSwap(controlId: string, optionIndex: number, lemma: string) {
    const nextLemmas = { ...lemmas, [controlId]: lemma };
    setLemmas(nextLemmas);
    setSeen((prev) => {
      const current = new Set(prev[controlId] ?? []);
      current.add(optionIndex);
      return { ...prev, [controlId]: [...current] };
    });
    const control = page.controls?.find((entry) => entry.id === controlId);
    if (!control || control.type !== 'swap') return;
    const blockId = control.target.split('/')[0] ?? '';
    const col = control.target.includes('/col:')
      ? Number(control.target.split(':')[1])
      : 0;
    const block = page.blocks.find((entry) => entry.id === blockId);
    if (block?.type !== 'table') return;
    const cell = block.cells[0]?.[col];
    if (!cell || Array.isArray(cell) || !('ref' in cell)) return;
    const id = applySwap(cell.ref, blockId, col, page.controls, nextLemmas);
    const tl = forms[id]?.tl;
    if (!tl) return;
    const ctrl = new AbortController();
    void playSpeech(tl, 'pt', ctrl.signal, speed);
  }

  const chrome: BlockChrome = {
    items: itemMap,
    forms,
    questions,
    partState,
    locked: (blockId) => locked.has(blockId),
    cover,
    onPlay: (text, lang) => {
      const ctrl = new AbortController();
      void playSpeech(text, lang, ctrl.signal, speed);
    },
    displayFormId: (blockId, colIndex, ref) =>
      applySwap(ref, blockId, colIndex, page.controls, lemmas),
    onQuestionAnswer: (questionId, optionIndex) => {
      postPageAnswer({
        kind: 'page_quiz',
        day,
        page_id: page.id,
        question_id: questionId,
        option_index: optionIndex,
      });
    },
    freshCell: (blockId, row, col) => {
      if (!fresh) return false;
      const control = page.controls?.find((entry) => entry.id === fresh.controlId);
      if (!control || control.type !== 'reveal_axis' || control.target !== blockId) return false;
      return control.axis === 'rows' ? fresh.index === row : fresh.index === col;
    },
  };

  const tip = captionTip(page, guided.phase, guided.playing, guided.index, activeChoice);
  const currentStep =
    page.mode === 'guided' && guided.playing && (guided.phase === 'ask' || guided.phase === 'why')
      ? steps[guided.index]
      : undefined;
  const ask = currentStep?.kind === 'ask' ? currentStep.ask : undefined;
  const titleTl = page.title
    .filter((seg) => seg.lang === 'tl')
    .map((seg) => seg.text)
    .join('');
  const quizIds = page.quiz ?? [];
  const comparePage = page.blocks.some((block) => block.type === 'compare');
  const circle =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-v2-rule bg-v2-card text-sm text-v2-ink shadow-sm disabled:opacity-40';

  const scroller = (
    <div className={embedded ? 'min-h-0 flex-1 overflow-y-auto' : undefined} style={{ paddingBottom: pad }}>
      <header className="sticky top-0 z-10 border-b border-v2-rule/80 bg-v2-paper/95 px-3 py-2 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          {embedded ? (
            <span className={circle}>عرض</span>
          ) : (
            <Link href={`/day/${day}`} aria-label="رجوع" className={circle}>
              ←
            </Link>
          )}
          <div className="min-w-0 flex-1 text-center">
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-wide text-v2-ink-muted">
              <span className="h-2 w-2 shrink-0 rounded-full bg-v2-success" />
              <span dir="ltr" className="font-[family-name:var(--font-v2-ui)]">
                {formatDayLabel(day)}
              </span>
              {page.pill ? (
                <span dir="rtl" className="font-[family-name:var(--font-v2-arabic)]">
                  · {page.pill}
                </span>
              ) : null}
            </p>
            <h1 className="text-sm font-extrabold leading-tight text-v2-ink">
              <RichText segments={page.title} tone="display" />
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {titleTl ? (
              <button
                type="button"
                aria-label="اسمع عنوان الصفحة"
                className={circle}
                onClick={() => {
                  const ctrl = new AbortController();
                  void playSpeech(titleTl, 'pt', ctrl.signal, speed);
                }}
              >
                <SpeakerIcon size={18} />
              </button>
            ) : null}
            {quizIds.length ? (
              <button
                type="button"
                className="h-9 rounded-full border border-v2-rule bg-v2-card px-2.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-v2-ink shadow-sm"
                onClick={() => setQuizOpen(true)}
              >
                اختبرني
              </button>
            ) : null}
            {page.cover ? (
              <button
                type="button"
                disabled={!pageComplete}
                className="h-9 rounded-full border border-v2-rule bg-v2-card px-2.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-v2-ink shadow-sm disabled:opacity-40"
                onClick={() => setCoverOn((on) => !on)}
              >
                {coverOn ? 'اظهر' : 'غطّي'}
              </button>
            ) : null}
          </div>
        </div>
      </header>
      {comparePage ? (
        <section className="mx-3 mt-3 rounded-2xl border border-v2-rule bg-v2-card px-3 py-3 text-center shadow-sm">
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full border border-v2-highlight-border bg-v2-highlight-fill px-3 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[11px] font-bold text-v2-ink">
            ملخّص القاعدة
          </div>
          <p className="text-3xl font-extrabold leading-tight">
            <RichText segments={page.title} tone="display" />
          </p>
          {page.subtitle ? (
            <p dir="rtl" className="mt-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              <RichText segments={page.subtitle} />
            </p>
          ) : null}
        </section>
      ) : page.subtitle ? (
        <p dir="rtl" className="mx-3 mt-3 text-end font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          <RichText segments={page.subtitle} />
        </p>
      ) : null}

      <div className="space-y-4 px-3 py-4">
        {page.mode === 'explore' ? (
          <ExploreControls
            page={page}
            seen={seen}
            activeChoice={activeChoice}
            lemmas={lemmas}
            onAxis={chooseAxis}
            onSwap={chooseSwap}
          />
        ) : null}
        <BlockChromeProvider value={chrome}>
          <div className="space-y-4">
            {page.blocks.map((block) => (
              <BlockView key={block.id} block={block} />
            ))}
          </div>
        </BlockChromeProvider>
      </div>
    </div>
  );

  return (
    <div
      className={
        embedded
          ? 'relative flex h-[720px] flex-col overflow-hidden rounded-v2-card border border-v2-ink bg-v2-paper'
          : 'relative flex min-h-dvh flex-col'
      }
      dir="ltr"
    >
      {scroller}
      <div className={embedded ? 'absolute inset-x-0 bottom-0 z-20' : 'pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center'}>
        <div ref={dockRef} className={embedded ? 'px-3 pb-3' : 'pointer-events-auto w-full max-w-[480px] px-3 pb-3'}>
          {ask ? (
            <AskBubble
              question={ask.question}
              options={ask.options}
              hint={guided.hint}
              why={guided.why}
              shake={guided.shake}
              locked={guided.phase === 'why'}
              onChoose={guided.answer}
            />
          ) : null}
          <CaptionBar
            tip={tip}
            chapters={page.mode === 'guided' ? chapters : []}
            paused={!guided.playing}
            speedLabel={speed === 1 ? '1×' : '0.8×'}
            onTogglePause={
              page.mode === 'guided' ? () => (guided.playing ? guided.pause() : guided.play()) : undefined
            }
            onCycleSpeed={
              page.mode === 'guided' ? () => setSpeed((current) => nextSpeed(current)) : undefined
            }
            onChapterSelect={
              page.mode === 'guided'
                ? (id) => {
                    const span = chapters.find((chapter) => chapter.id === id);
                    if (span) guided.jumpTo(span.start);
                  }
                : undefined
            }
          />
          {page.mode === 'guided' && guided.phase !== 'done' ? (
            <div className="px-1 pb-2">
              <SecondaryButton className="w-full" onClick={guided.showAll}>
                الصفحة كلها
              </SecondaryButton>
            </div>
          ) : null}
        </div>
      </div>
      {quizOpen ? (
        <QuizSheet
          embedded={embedded}
          ids={quizIds}
          questions={questions}
          items={itemMap}
          onAnswer={(questionId, optionIndex) => {
            postPageAnswer({
              kind: 'page_quiz',
              day,
              page_id: page.id,
              question_id: questionId,
              option_index: optionIndex,
            });
          }}
          onClose={() => setQuizOpen(false)}
        />
      ) : null}
    </div>
  );
}

function exploreReady(page: Page, completed: ReadonlySet<string>): boolean {
  const axes = (page.controls ?? []).filter((control) => control.type === 'reveal_axis');
  const swaps = (page.controls ?? []).filter((control) => control.type === 'swap');
  if (axes.length) return axes.every((control) => completed.has(control.id));
  if (swaps.length) return swaps.every((control) => completed.has(control.id));
  return true;
}

function explorePartState(
  page: Page,
  blockId: string,
  part: string | null,
  seen: Readonly<Record<string, readonly number[]>>,
  active: { controlId: string; index: number } | null,
): PartVisibility {
  const control = (page.controls ?? []).find(
    (entry) => entry.type === 'reveal_axis' && entry.target === blockId,
  );
  if (!control || control.type !== 'reveal_axis') return 'shown';
  const seenIndexes = seen[control.id] ?? [];
  const choice = (index: number): PartVisibility => {
    if (active?.controlId === control.id && active.index === index) return 'active';
    if (seenIndexes.includes(index)) return 'shown';
    return 'dim';
  };
  if (!part || part.startsWith('col:')) {
    if (control.axis === 'cols' && part?.startsWith('col:')) return choice(Number(part.slice(4)));
    return 'shown';
  }
  if (part.startsWith('row:')) {
    if (control.axis !== 'rows') return 'shown';
    return choice(Number(part.slice(4)));
  }
  if (part.startsWith('cell:')) {
    const bits = part.split(':');
    const index = control.axis === 'rows' ? Number(bits[1]) : Number(bits[2]);
    return choice(index);
  }
  if (part.startsWith('entry:') && control.axis === 'cols') {
    return choice(Number(part.split(':')[1]));
  }
  return 'shown';
}

function captionTip(
  page: Page,
  phase: 'idle' | 'reading' | 'ask' | 'why' | 'done',
  playing: boolean,
  index: number,
  activeChoice: { controlId: string; index: number } | null,
): RtSegment[] {
  if (page.mode === 'explore') {
    const control = page.controls?.find((entry) => entry.id === activeChoice?.controlId);
    if (control?.type === 'reveal_axis' && activeChoice) {
      return control.tips[activeChoice.index] ?? page.subtitle ?? [{ text: 'تمام.', lang: 'eg' }];
    }
    return page.subtitle ?? [{ text: 'اختار شخص عشان تشوف التصريف.', lang: 'eg' }];
  }
  if (page.mode === 'static') {
    return page.subtitle ?? [{ text: 'دوس على أي سطر عشان تسمعه.', lang: 'eg' }];
  }
  if (phase === 'done') {
    return [{ text: 'خلّصنا الصفحة. ارجع للخريطة، أو جرّب غطّي.', lang: 'eg' }];
  }
  if (!playing && phase !== 'ask' && phase !== 'why') {
    return index === 0 && phase === 'idle'
      ? [{ text: 'دوس ▶︎ نبدأ.', lang: 'eg' }]
      : [{ text: 'واقفين. دوس ▶︎ نكمّل.', lang: 'eg' }];
  }
  const step = page.steps?.[index];
  return (step?.kind === 'reveal' ? step.tip : undefined) ?? [{ text: 'سؤال سريع…', lang: 'eg' }];
}

function axisSpeech(
  page: Page,
  blockId: string,
  axis: 'rows' | 'cols',
  index: number,
  items: ReadonlyMap<string, Item>,
  forms: Readonly<Record<string, FormView>>,
  lemmas: Readonly<Record<string, string>>,
): string | null {
  const block = page.blocks.find((entry) => entry.id === blockId);
  if (block?.type === 'table') {
    const bits: string[] = [];
    const cells =
      axis === 'rows'
        ? (block.cells[index] ?? []).map((cell, col) => ({ cell, col }))
        : block.cells.map((row) => ({ cell: row[index], col: index }));
    for (const { cell, col } of cells) {
      if (!cell || Array.isArray(cell) || !('ref' in cell)) continue;
      const id = applySwap(cell.ref, blockId, col, page.controls, lemmas);
      const tl = forms[id]?.tl ?? itemTargetText(items.get(cell.ref));
      if (tl) bits.push(tl);
    }
    if (bits.length) return bits.join('. ');
  }
  const target = axis === 'rows' ? `${blockId}/row:${index}` : `${blockId}/col:${index}`;
  return targetSpeech(page, target, items, forms);
}

function ExploreControls({
  page,
  seen,
  activeChoice,
  lemmas,
  onAxis,
  onSwap,
}: {
  page: Page;
  seen: Readonly<Record<string, readonly number[]>>;
  activeChoice: { controlId: string; index: number } | null;
  lemmas: Readonly<Record<string, string>>;
  onAxis: (controlId: string, index: number) => void;
  onSwap: (controlId: string, optionIndex: number, lemma: string) => void;
}) {
  const controls = page.controls ?? [];
  return (
    <div className="space-y-3">
      {controls.map((control) => {
        if (control.type === 'reveal_axis') {
          const buttons = axisButtons(page, control);
          const seenIndexes = seen[control.id] ?? [];
          const hintIndex = buttons.find((button) => !seenIndexes.includes(button.index))?.index;
          return (
            <div key={control.id} className="flex gap-1.5">
              {buttons.map((button) => {
                const on =
                  activeChoice?.controlId === control.id && activeChoice.index === button.index;
                const done = seenIndexes.includes(button.index);
                return (
                  <button
                    key={button.index}
                    type="button"
                    onClick={() => onAxis(control.id, button.index)}
                    className={[
                      'min-w-0 flex-1 rounded-v2-chip border px-1 py-1.5 text-xs',
                      on || done
                        ? 'border-v2-ink bg-v2-ink text-white'
                        : 'border-v2-ink bg-v2-card text-v2-ink',
                      hintIndex === button.index ? 'animate-pulse' : '',
                    ].join(' ')}
                  >
                    <RichText segments={button.label} tone={on || done ? 'onDark' : 'default'} />
                  </button>
                );
              })}
            </div>
          );
        }
        if (control.type === 'swap') {
          return (
            <div key={control.id} className="flex flex-wrap gap-1.5">
              {control.options.map((lemma, index) => {
                const on = lemmas[control.id] === lemma;
                return (
                  <button
                    key={lemma}
                    type="button"
                    onClick={() => onSwap(control.id, index, lemma)}
                    className={[
                      'rounded-v2-chip border px-2 py-1 font-[family-name:var(--font-v2-target)] text-sm',
                      on ? 'border-v2-ink bg-v2-ink text-white' : 'border-v2-ink bg-v2-card',
                    ].join(' ')}
                  >
                    {lemma}
                  </button>
                );
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function axisButtons(
  page: Page,
  control: Extract<NonNullable<Page['controls']>[number], { type: 'reveal_axis' }>,
): { index: number; label: Rt }[] {
  const block = page.blocks.find((entry) => entry.id === control.target);
  if (block?.type === 'table' && control.axis === 'rows') {
    return block.rows.map((row, index) => ({ index, label: row.label }));
  }
  if (block?.type === 'table' && control.axis === 'cols') {
    return block.cols.map((col, index) => ({ index, label: col.label }));
  }
  if (block?.type === 'compare' && control.axis === 'cols') {
    return block.columns.map((col, index) => ({ index, label: col.head }));
  }
  return control.tips.map((tip, index) => ({ index, label: tip }));
}

function AskBubble({
  question,
  options,
  hint,
  why,
  shake,
  locked,
  onChoose,
}: {
  question: Rt;
  options: { label: Rt; correct: boolean }[];
  hint: Rt | null;
  why: Rt | null;
  shake: number;
  locked: boolean;
  onChoose: (index: number) => void;
}) {
  return (
    <div
      key={shake}
      className={[
        'mx-3 mb-2 rounded-v2-card border-2 border-v2-highlight-border bg-v2-highlight-fill p-3',
        shake > 0 && !why ? 'v2-shake' : '',
      ].join(' ')}
    >
      <p className="text-base">
        <RichText segments={question} />
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option, index) => (
          <button
            key={index}
            type="button"
            disabled={locked}
            onClick={() => onChoose(index)}
            className="rounded-v2-chip border border-v2-ink bg-white px-3 py-1.5 text-sm disabled:opacity-60"
          >
            <RichText segments={option.label} />
          </button>
        ))}
      </div>
      {why ? (
        <p className="mt-2 text-sm">
          <RichText segments={why} />
        </p>
      ) : null}
      {hint && !why ? (
        <p className="mt-2 text-sm">
          <RichText segments={hint} />
        </p>
      ) : null}
    </div>
  );
}

function QuizSheet({
  embedded,
  ids,
  questions,
  items,
  onAnswer,
  onClose,
}: {
  embedded: boolean;
  ids: string[];
  questions: Question[];
  items: ReadonlyMap<string, Item>;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onClose: () => void;
}) {
  const [cursor, setCursor] = useState(0);
  const [answered, setAnswered] = useState(false);
  const id = ids[cursor];
  const question = questions.find((entry) => entry.id === id);
  const last = cursor >= ids.length - 1;

  return (
    <div
      className={
        embedded
          ? 'absolute inset-0 z-40 flex flex-col bg-v2-paper'
          : 'fixed inset-0 z-40 flex justify-center bg-v2-paper/80'
      }
    >
      <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'flex h-full w-full max-w-[480px] flex-col bg-v2-paper'}>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
          اختبرني · {cursor + 1}/{ids.length}
        </p>
        <button type="button" className="text-sm" onClick={onClose}>
          إغلاق
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {question ? (
          <QuestionCard
            key={question.id}
            question={question}
            items={items}
            onAnswer={(optionIndex) => {
              if (answered || !id) return;
              setAnswered(true);
              onAnswer(id, optionIndex);
            }}
          />
        ) : (
          <p className="text-sm">السؤال مش موجود.</p>
        )}
      </div>
      <div className="px-3 py-3">
        <SecondaryButton
          className="w-full"
          disabled={!answered}
          onClick={() => {
            if (last) {
              onClose();
              return;
            }
            setCursor((current) => current + 1);
            setAnswered(false);
          }}
        >
          {last ? 'رجوع للصفحة' : 'التالي'}
        </SecondaryButton>
      </div>
      </div>
    </div>
  );
}
