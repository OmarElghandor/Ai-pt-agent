'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ImageSlot } from '@/components/v2/ImageSlot';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type {
  StoryAfterQuestion,
  StoryDoc,
  StoryLine,
} from '@/lib/v2/content/story';
import { markPageDone } from './session';

type DialogueLine = {
  speaker: string;
  tl: string;
  ar?: string;
  ids?: string[];
  side?: 'left' | 'right' | 'center';
};

type Props = {
  day: number;
  page: Page;
  items: Item[];
  /** intro = watch-only; test = uninterrupted replay + after_questions */
  mode: 'intro' | 'test';
  situationEg?: string;
  titleTl?: string;
  nextHref?: string | null;
  /** Preferred: loaded story document (from story_id). */
  story?: StoryDoc | null;
  storyId?: string | null;
};

const STORY_SPEEDS = [0.75, 1, 1.25] as const;
type StorySpeed = (typeof STORY_SPEEDS)[number];

const TTS_CAP_MS = 12_000;
const FAIL_SKIP_MS = 300;

function isLearner(speaker: string, cast?: StoryDoc['cast']): boolean {
  const sp = speaker.trim().toLowerCase();
  if (sp === 'learner') return true;
  return Boolean(
    cast?.some((c) => c.id.toLowerCase() === sp && c.role === 'learner'),
  );
}

function linesFromStory(story: StoryDoc): DialogueLine[] {
  return story.lines.map((l: StoryLine) => ({
    speaker: l.speaker,
    tl: l.tl,
    ar: l.ar,
    ids: l.ids,
    side: l.side,
  }));
}

function linesFromPage(page: Page): DialogueLine[] {
  const dialogue = page.blocks.find((b) => b.type === 'dialogue');
  if (dialogue?.type !== 'dialogue') return [];
  return dialogue.lines.map((l) => ({
    speaker: l.speaker,
    tl: l.tl,
    ar: l.ar,
    ids: l.ids,
  }));
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

function postStoryAnswer(opts: {
  day: number;
  questionId: string;
  lineIndex: number;
  optionIndex: number;
  correctIndex: number;
}): void {
  void opts.lineIndex;
  void fetch('/api/v2/answers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-timezone':
        typeof Intl !== 'undefined'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : 'UTC',
    },
    body: JSON.stringify({
      kind: 'closed',
      answer_id: newAnswerId(),
      day: opts.day,
      skill: 'listening',
      option_index: opts.optionIndex,
      correct_index: opts.correctIndex,
      question_id: opts.questionId,
      tool_id: 'story',
    }),
  }).catch(() => {});
}

async function fetchLineBlob(opts: {
  storyId: string;
  lineIndex: number;
  speaker: string;
  signal?: AbortSignal;
}): Promise<Blob | null> {
  try {
    const res = await fetch(
      `/api/v2/stories/${encodeURIComponent(opts.storyId)}/lines/${opts.lineIndex}/tts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speed: 'normal',
          speaker: opts.speaker,
        }),
        signal: opts.signal,
      },
    );
    if (!res.ok || opts.signal?.aborted) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

export function StoryPlayer({
  day,
  page,
  items,
  mode,
  situationEg,
  titleTl,
  nextHref = null,
  story: storyProp = null,
  storyId: storyIdProp = null,
}: Props) {
  const resolvedStoryId =
    storyIdProp ?? storyProp?.id ?? page.story_id ?? null;

  const [story, setStory] = useState<StoryDoc | null>(storyProp ?? null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (storyProp) {
      setStory(storyProp);
      return;
    }
    if (!resolvedStoryId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/v2/stories/${encodeURIComponent(resolvedStoryId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setLoadError(true);
          return;
        }
        const data = (await res.json()) as { story: StoryDoc };
        if (!cancelled) setStory(data.story);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedStoryId, storyProp]);

  const lines: DialogueLine[] = useMemo(() => {
    if (story) return linesFromStory(story);
    return linesFromPage(page);
  }, [story, page]);

  const afterQuestions: StoryAfterQuestion[] = useMemo(
    () => story?.after_questions ?? [],
    [story],
  );

  const [index, setIndex] = useState(0);
  /** User wants continuous autoplay; starts true. */
  const [wantPlay, setWantPlay] = useState(true);
  const [audioBusy, setAudioBusy] = useState(false);
  const [speed, setSpeed] = useState<StorySpeed>(1);
  const [showMeaning, setShowMeaning] = useState(false);
  const [meaningsOpened, setMeaningsOpened] = useState(0);
  const [done, setDone] = useState(false);
  const [askPhase, setAskPhase] = useState(false);
  const [askIndex, setAskIndex] = useState(0);
  const [askCorrect, setAskCorrect] = useState(0);
  const [askWrongId, setAskWrongId] = useState<string | null>(null);
  const [askAnswered, setAskAnswered] = useState(false);

  const blobCacheRef = useRef<Map<number, Blob>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speedRef = useRef(speed);
  const wantPlayRef = useRef(wantPlay);
  const playGenRef = useRef(0);

  useEffect(() => {
    speedRef.current = speed;
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    wantPlayRef.current = wantPlay;
  }, [wantPlay]);

  const line = lines[index];
  const total = lines.length;
  const cast = story?.cast;

  const characterLabel = useMemo(() => {
    if (!line || isLearner(line.speaker, cast)) return 'إنت بتقول';
    return `${line.speaker} بتتكلم`;
  }, [line, cast]);

  function finishStory() {
    if (mode === 'test' && afterQuestions.length > 0) {
      setAskPhase(true);
      setAskIndex(0);
      setAskCorrect(0);
      setAskWrongId(null);
      setAskAnswered(false);
      setWantPlay(false);
      return;
    }
    setDone(true);
    setWantPlay(false);
    markPageDone(day, mode === 'test' ? `${page.id}__test` : page.id);
  }

  function advanceOrFinish(fromIndex: number) {
    if (fromIndex + 1 >= total) {
      finishStory();
    } else {
      setShowMeaning(false);
      setIndex(fromIndex + 1);
    }
  }

  // Prefetch next line while current plays / whenever index changes.
  useEffect(() => {
    if (!resolvedStoryId || done || askPhase) return;
    const next = index + 1;
    if (next >= lines.length) return;
    if (blobCacheRef.current.has(next)) return;
    const nextLine = lines[next];
    if (!nextLine) return;
    const ac = new AbortController();
    void fetchLineBlob({
      storyId: resolvedStoryId,
      lineIndex: next,
      speaker: nextLine.speaker,
      signal: ac.signal,
    }).then((blob) => {
      if (blob && !ac.signal.aborted) blobCacheRef.current.set(next, blob);
    });
    return () => ac.abort();
  }, [index, resolvedStoryId, lines, done, askPhase]);

  // Playback loop: plays current line when wantPlay; advances when audio ends.
  useEffect(() => {
    if (done || askPhase || !line || !wantPlay) {
      setAudioBusy(false);
      return;
    }

    const gen = ++playGenRef.current;
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      setAudioBusy(true);
      if (mode === 'intro') setShowMeaning(false);

      // No story id (embedded dialogue): brief beat then advance.
      if (!resolvedStoryId) {
        await sleep(900 / speedRef.current, ac.signal);
        if (cancelled || gen !== playGenRef.current) return;
        setAudioBusy(false);
        if (wantPlayRef.current) advanceOrFinish(index);
        return;
      }

      let blob = blobCacheRef.current.get(index) ?? null;
      if (!blob) {
        blob = await fetchLineBlob({
          storyId: resolvedStoryId,
          lineIndex: index,
          speaker: line.speaker,
          signal: ac.signal,
        });
        if (blob) blobCacheRef.current.set(index, blob);
      }

      if (cancelled || gen !== playGenRef.current || ac.signal.aborted) return;

      if (!blob) {
        await sleep(FAIL_SKIP_MS, ac.signal);
        if (cancelled || gen !== playGenRef.current) return;
        setAudioBusy(false);
        if (wantPlayRef.current) advanceOrFinish(index);
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = speedRef.current;
      audioRef.current = audio;

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(cap);
          URL.revokeObjectURL(url);
          if (audioRef.current === audio) audioRef.current = null;
          resolve();
        };
        const cap = window.setTimeout(() => {
          audio.pause();
          finish();
        }, TTS_CAP_MS / Math.max(0.5, speedRef.current));
        audio.onended = finish;
        audio.onerror = finish;
        void audio.play().catch(finish);
      });

      if (cancelled || gen !== playGenRef.current) return;
      setAudioBusy(false);
      if (wantPlayRef.current) advanceOrFinish(index);
    };

    void run();

    return () => {
      cancelled = true;
      ac.abort();
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.onended = null;
        a.onerror = null;
        audioRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advance uses stable index snapshot
  }, [index, wantPlay, done, askPhase, line, resolvedStoryId, mode, total, day, page.id, afterQuestions.length]);

  function togglePlay() {
    if (wantPlay) {
      setWantPlay(false);
      playGenRef.current += 1;
      const a = audioRef.current;
      if (a) a.pause();
      setAudioBusy(false);
      return;
    }
    setWantPlay(true);
  }

  function cycleSpeed() {
    setSpeed((s) => {
      const i = STORY_SPEEDS.indexOf(s);
      return STORY_SPEEDS[(i + 1) % STORY_SPEEDS.length] ?? 1;
    });
  }

  function openMeaning() {
    if (mode !== 'intro') return;
    if (!showMeaning) setMeaningsOpened((n) => n + 1);
    setShowMeaning(true);
  }

  function restart() {
    playGenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    blobCacheRef.current.clear();
    setIndex(0);
    setDone(false);
    setAskPhase(false);
    setAskIndex(0);
    setAskCorrect(0);
    setAskWrongId(null);
    setAskAnswered(false);
    setMeaningsOpened(0);
    setShowMeaning(false);
    setWantPlay(true);
  }

  function finishAskPhase() {
    setAskPhase(false);
    setDone(true);
    markPageDone(day, `${page.id}__test`);
  }

  function pickAfterOption(
    q: StoryAfterQuestion,
    opt: { id: string; label: string; correct: boolean },
    optionIndex: number,
  ) {
    if (askAnswered) return;
    const correctIndex = q.options.findIndex((o) => o.correct);
    postStoryAnswer({
      day,
      questionId: q.id,
      lineIndex: q.line_index,
      optionIndex,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
    });
    if (opt.correct) {
      setAskCorrect((n) => n + 1);
      setAskWrongId(null);
      setAskAnswered(true);
      window.setTimeout(() => {
        if (askIndex + 1 >= afterQuestions.length) {
          finishAskPhase();
        } else {
          setAskIndex((i) => i + 1);
          setAskAnswered(false);
          setAskWrongId(null);
        }
      }, 450);
      return;
    }
    setAskWrongId(opt.id);
    setAskAnswered(true);
    window.setTimeout(() => {
      if (askIndex + 1 >= afterQuestions.length) {
        finishAskPhase();
      } else {
        setAskIndex((i) => i + 1);
        setAskAnswered(false);
        setAskWrongId(null);
      }
    }, 700);
  }

  if (resolvedStoryId && !story && !loadError && !linesFromPage(page).length) {
    return (
      <main className="px-4 py-8">
        <p className="font-[family-name:var(--font-v2-arabic)]">بتحميل القصة…</p>
      </main>
    );
  }

  if (!lines.length) {
    return (
      <main className="px-4 py-8">
        <p className="font-[family-name:var(--font-v2-arabic)]">
          مفيش حوار في الصفحة دي.
        </p>
        <Link
          href={`/day/${day}`}
          className="mt-4 inline-block text-sm text-v2-primary"
        >
          رجوع
        </Link>
      </main>
    );
  }

  if (askPhase && mode === 'test') {
    const q = afterQuestions[askIndex];
    if (!q) {
      finishAskPhase();
      return null;
    }
    return (
      <main className="flex min-h-dvh flex-col px-4 py-8">
        <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          سؤال {askIndex + 1} من {afterQuestions.length}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-v2-arabic)] text-xl text-v2-primary">
          {q.prompt_eg}
        </h1>
        <div className="mt-6 space-y-2">
          {q.options.map((opt, oi) => (
            <button
              key={opt.id}
              type="button"
              dir={q.kind === 'line_meaning' ? 'rtl' : 'ltr'}
              disabled={askAnswered}
              onClick={() => pickAfterOption(q, opt, oi)}
              className={[
                'block w-full rounded-v2-card border px-3 py-3 text-start',
                q.kind === 'line_meaning'
                  ? 'font-[family-name:var(--font-v2-arabic)]'
                  : 'font-[family-name:var(--font-v2-target)]',
                askWrongId === opt.id
                  ? 'border-amber-400 bg-amber-50 text-amber-900'
                  : askAnswered && opt.correct
                    ? 'border-v2-primary bg-v2-primary/10'
                    : 'border-v2-line bg-v2-card',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </main>
    );
  }

  if (done) {
    if (mode === 'intro') {
      return (
        <main className="flex min-h-dvh flex-col px-4 py-8">
          <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl text-v2-primary">
            خلّصت القصة
          </h1>
          {meaningsOpened > 0 ? (
            <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
              فتحت المعنى {meaningsOpened} مرة
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-3">
            {nextHref ? (
              <PrimaryButton href={nextHref}>الصفحة الجاية</PrimaryButton>
            ) : (
              <PrimaryButton href={`/day/${day}`}>خريطة اليوم</PrimaryButton>
            )}
            <button
              type="button"
              className="min-h-11 rounded-v2-chip border border-v2-line bg-v2-card px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base text-v2-primary"
              onClick={restart}
            >
              من الأول
            </button>
          </div>
        </main>
      );
    }

    const n = afterQuestions.length;
    return (
      <main className="flex min-h-dvh flex-col px-4 py-8">
        <h1 className="font-[family-name:var(--font-v2-arabic)] text-2xl text-v2-primary">
          فهمت {askCorrect} من {n || askCorrect}
        </h1>
        <div className="mt-8 flex flex-col gap-3">
          {nextHref ? (
            <PrimaryButton href={nextHref}>التالي</PrimaryButton>
          ) : (
            <PrimaryButton href={`/day/${day}`}>خريطة اليوم</PrimaryButton>
          )}
          <button
            type="button"
            className="min-h-11 rounded-v2-chip border border-v2-line bg-v2-card px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base text-v2-primary"
            onClick={restart}
          >
            اسمعها تاني
          </button>
        </div>
      </main>
    );
  }

  const prev = index > 0 ? lines[index - 1] : null;
  const learnerLeft = (l: DialogueLine) =>
    l.side === 'left' || (l.side == null && isLearner(l.speaker, cast));
  const speedLabel =
    speed === 1 ? '1×' : speed === 0.75 ? '0.75×' : '1.25×';

  return (
    <main className="relative flex min-h-dvh flex-col bg-v2-paper">
      <div className="relative h-[70vh] min-h-[280px] w-full overflow-hidden">
        <ImageSlot variant="cover" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/50" />
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3 pt-3">
          <Link
            href={`/day/${day}`}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur"
            aria-label="رجوع"
          >
            →
          </Link>
          <div className="text-end text-white">
            <p className="font-[family-name:var(--font-v2-ui)] text-[11px] text-v2-highlight">
              Dia {day}
              {titleTl ? ` · ${titleTl}` : ''}
            </p>
          </div>
          {mode === 'intro' ? (
            <button
              type="button"
              onClick={openMeaning}
              className="rounded-full bg-black/30 px-3 py-2 text-xs text-white backdrop-blur"
            >
              المعنى
            </button>
          ) : (
            <span className="w-10" />
          )}
        </header>
        {situationEg ? (
          <p className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-white">
            {situationEg}
          </p>
        ) : null}
        <div className="absolute inset-x-4 bottom-6 z-10 space-y-2">
          {prev ? (
            <div
              className={[
                'max-w-[85%] rounded-2xl bg-white/80 px-3 py-2 opacity-50',
                learnerLeft(prev) ? 'ms-auto' : 'me-auto',
              ].join(' ')}
            >
              <p
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] text-sm"
              >
                {prev.tl}
              </p>
            </div>
          ) : null}
          {line ? (
            <button
              type="button"
              onClick={mode === 'intro' ? openMeaning : undefined}
              className={[
                'max-w-[90%] rounded-2xl bg-white px-4 py-3 text-start shadow',
                learnerLeft(line)
                  ? 'ms-auto ring-2 ring-v2-action'
                  : 'me-auto ring-2 ring-v2-primary',
              ].join(' ')}
            >
              <p
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] text-lg font-semibold"
              >
                {line.tl}
              </p>
            </button>
          ) : null}
        </div>
      </div>

      <section className="relative z-20 -mt-4 flex flex-1 flex-col rounded-t-3xl bg-v2-paper px-4 pb-8 pt-5">
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {characterLabel}
          {audioBusy && wantPlay ? ' · …' : ''}
        </p>
        {line ? (
          <>
            <p
              dir="ltr"
              className="mt-2 font-[family-name:var(--font-v2-target)] text-2xl font-semibold text-v2-ink"
            >
              {line.tl}
            </p>
            {(() => {
              const say = line.ids
                ?.map((id) => items.find((i) => i.id === id))
                .map((i) => (i && 'say' in i ? i.say : null))
                .filter(Boolean)
                .join(' ');
              return say ? (
                <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
                  {say}
                </p>
              ) : null;
            })()}
            {mode === 'intro' && showMeaning && line.ar ? (
              <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
                {line.ar}
              </p>
            ) : null}
            {mode === 'intro' && !showMeaning && line.ar ? (
              <button
                type="button"
                onClick={openMeaning}
                className="mt-2 self-start font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted underline-offset-2 hover:underline"
              >
                المعنى؟
              </button>
            ) : null}
          </>
        ) : null}

        <p className="mt-4 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          جملة {index + 1} من {total}
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-v2-rule">
          <div
            className="h-full rounded-full bg-gradient-to-l from-v2-action to-v2-primary"
            style={{ width: `${((index + 1) / Math.max(1, total)) * 100}%` }}
          />
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={cycleSpeed}
            className="min-h-11 min-w-14 rounded-v2-chip border border-v2-line bg-v2-card px-3 font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-primary"
            aria-label="سرعة الصوت"
          >
            {speedLabel}
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-v2-action text-2xl text-white shadow-[var(--shadow-v2-soft)]"
            aria-label={wantPlay ? 'إيقاف' : 'تشغيل'}
          >
            {wantPlay ? '❚❚' : '▶'}
          </button>
        </div>
      </section>
    </main>
  );
}
