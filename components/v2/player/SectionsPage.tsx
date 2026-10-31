'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BlockChromeProvider, type BlockChrome } from '@/components/v2/blocks/chrome';
import { BlockView } from '@/components/v2/blocks/BlockView';
import { QuestionCard } from '@/components/v2/blocks/QuestionCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { RichText } from '@/components/v2/RichText';
import { TitleBlock } from '@/components/v2/TitleBlock';
import type { Item } from '@/lib/v2/content/items';
import type { Question } from '@/lib/v2/content/lesson';
import type { Page } from '@/lib/v2/content/page';
import { applySwap, completedControlIds, lockedBlockIds } from '@/lib/v2/render/explore';
import type { FormView } from '@/lib/v2/render/forms';
import { plainRt } from '@/lib/v2/render/speechTarget';
import { formatDayLabel } from '@/lib/v2/render/dayMinutes';
import { playSpeech } from './speech';
import { markPageDone, postPageAnswer } from './session';

type Props = {
  day: number;
  page: Page;
  items: Item[];
  questions: Question[];
  forms: Record<string, FormView>;
  nextHref?: string | null;
  isLastPage?: boolean;
  embedded?: boolean;
};

/** Grammar page: explain → examples toggle → check. No guided autoplay. */
export function SectionsPage({
  day,
  page,
  items,
  questions,
  forms,
  nextHref = null,
  isLastPage = false,
  embedded = false,
}: Props) {
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [explainPlaying, setExplainPlaying] = useState(false);
  const [highlightExample, setHighlightExample] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number[]>>({});
  const [lemmas, setLemmas] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const mainBlocks = page.blocks.filter(
    (b) => b.type !== 'examples' && b.type !== 'practice',
  );
  const exampleBlocks = page.blocks.filter((b) => b.type === 'examples');
  const checkQuestions = useMemo(() => {
    const ids = page.check ?? [];
    return ids
      .map((id) => questions.find((q) => q.id === id))
      .filter((q): q is Question => Boolean(q))
      .slice(0, 3);
  }, [page.check, questions]);

  const completed = useMemo(() => completedControlIds(page, seen), [page, seen]);
  const locked = useMemo(() => lockedBlockIds(page, completed), [page, completed]);

  useEffect(() => {
    if (embedded) return;
    markPageDone(day, page.id);
  }, [embedded, day, page.id]);

  useEffect(() => {
    const text = plainRt(page.explain ?? []);
    if (!text.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setExplainPlaying(true);
    void playSpeech(text, 'ar', ac.signal, 1).finally(() => {
      if (!ac.signal.aborted) setExplainPlaying(false);
    });
    return () => {
      ac.abort();
      setExplainPlaying(false);
    };
  }, [page.id, page.explain]);

  function toggleExplainAudio() {
    if (explainPlaying) {
      abortRef.current?.abort();
      setExplainPlaying(false);
      return;
    }
    const text = plainRt(page.explain ?? []);
    if (!text.trim()) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setExplainPlaying(true);
    void playSpeech(text, 'ar', ac.signal, 1).finally(() => {
      if (!ac.signal.aborted) setExplainPlaying(false);
    });
  }

  const chrome: BlockChrome = {
    items: itemMap,
    forms,
    questions,
    partState: () => 'shown',
    locked: (blockId) => locked.has(blockId),
    cover: null,
    onPlay: (text, lang) => {
      const ctrl = new AbortController();
      void playSpeech(text, lang, ctrl.signal, 1);
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
    freshCell: () => false,
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col px-4 pb-28 pt-3">
      <header className="flex items-center justify-between gap-2">
        <Link
          href={`/day/${day}`}
          className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink"
        >
          رجوع
        </Link>
        <p className="font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
          {formatDayLabel(day)}
          {page.pill ? ` · ${page.pill}` : ''}
        </p>
      </header>

      <TitleBlock
        pill={page.pill}
        title={<RichText segments={page.title} tone="display" />}
        subtitle={
          page.subtitle ? <RichText segments={page.subtitle} /> : undefined
        }
      />

      <BlockChromeProvider value={chrome}>
        <section className="mt-4 space-y-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary">
            الشرح
          </p>
          {mainBlocks.map((block) => (
            <div
              key={block.id}
              className={
                highlightExample === block.id
                  ? 'rounded-v2-card ring-2 ring-amber-400'
                  : undefined
              }
            >
              <BlockView block={block} />
            </div>
          ))}
          {page.explain?.length ? (
            <div className="rounded-v2-card bg-v2-note px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 font-[family-name:var(--font-v2-arabic)] text-sm leading-relaxed">
                  <RichText segments={page.explain} />
                </div>
                <button
                  type="button"
                  onClick={toggleExplainAudio}
                  className="shrink-0 rounded-full border border-v2-line bg-v2-card px-2.5 py-1 text-xs text-v2-primary"
                  aria-label={explainPlaying ? 'إيقاف' : 'إعادة'}
                >
                  {explainPlaying ? '❚❚' : '▶'}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => setExamplesOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-v2-chip border border-v2-primary px-4 py-3 font-[family-name:var(--font-v2-arabic)] text-base text-v2-primary"
          >
            <span>الأمثلة</span>
            <span aria-hidden>{examplesOpen ? '⌃' : '⌄'}</span>
          </button>
          {examplesOpen ? (
            <div className="space-y-3">
              {page.controls?.length ? (
                <div className="flex flex-wrap gap-2">
                  {page.controls.map((c) => {
                    if (c.type === 'swap') {
                      return c.options.map((opt, oi) => (
                        <button
                          key={`${c.id}-${oi}`}
                          type="button"
                          dir="ltr"
                          onClick={() => {
                            setSeen((prev) => {
                              const cur = prev[c.id] ?? [];
                              if (cur.includes(oi)) return prev;
                              return { ...prev, [c.id]: [...cur, oi] };
                            });
                            setLemmas((prev) => ({ ...prev, [c.id]: opt }));
                          }}
                          className="rounded-v2-chip border border-v2-line bg-v2-card px-3 py-1.5 font-[family-name:var(--font-v2-target)] text-sm"
                        >
                          {opt}
                        </button>
                      ));
                    }
                    if (c.type === 'reveal_axis') {
                      return c.tips.map((_, ti) => (
                        <button
                          key={`${c.id}-${ti}`}
                          type="button"
                          onClick={() => {
                            setSeen((prev) => {
                              const cur = prev[c.id] ?? [];
                              if (cur.includes(ti)) return prev;
                              return { ...prev, [c.id]: [...cur, ti] };
                            });
                          }}
                          className="rounded-v2-chip border border-v2-line bg-v2-card px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-sm"
                        >
                          {ti + 1}
                        </button>
                      ));
                    }
                    return null;
                  })}
                </div>
              ) : null}
              {exampleBlocks.map((block) => (
                <div
                  key={block.id}
                  className={
                    highlightExample === block.id
                      ? 'rounded-v2-card ring-2 ring-amber-400'
                      : undefined
                  }
                >
                  <BlockView block={block} />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {checkQuestions.length ? (
          <section className="mt-6 space-y-3">
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
              فهمت؟
            </p>
            {checkQuestions.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                items={itemMap}
                onAnswer={(optionIndex, correct) => {
                  postPageAnswer({
                    kind: 'page_quiz',
                    day,
                    page_id: page.id,
                    question_id: q.id,
                    option_index: optionIndex,
                  });
                  if (!correct && exampleBlocks[0]) {
                    setHighlightExample(exampleBlocks[0].id);
                    setExamplesOpen(true);
                  }
                }}
              />
            ))}
          </section>
        ) : null}
      </BlockChromeProvider>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-[390px] flex-col gap-2 bg-gradient-to-t from-v2-paper via-v2-paper to-transparent px-4 pb-6 pt-8">
        {nextHref ? (
          <PrimaryButton href={nextHref}>التالي</PrimaryButton>
        ) : isLastPage ? (
          <PrimaryButton href={`/day/${day}/questions`}>أسئلة اليوم</PrimaryButton>
        ) : (
          <PrimaryButton href={`/day/${day}`}>خريطة اليوم</PrimaryButton>
        )}
      </div>
    </main>
  );
}
