'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DemoImageGenerate } from '@/components/v2/DemoImageGenerate';
import { ImageSlot } from '@/components/v2/ImageSlot';
import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import type { StoryDoc, StoryLine } from '@/lib/v2/content/story';
import { isCloudinaryUrl } from '@/lib/v2/images/cloudinaryUrl';
import { markPageDone } from './session';

/** Width-only Cloudinary URL so object-cover can fill the tall hero. */
function storyHeroDisplayUrl(
  url: string | null | undefined,
  width = 1200,
): string | null {
  if (!url) return null;
  if (!isCloudinaryUrl(url)) return url;
  const transform = [
    'c_fill',
    'f_auto',
    'q_auto',
    `w_${Math.max(1, Math.round(width))}`,
  ].join(',');
  const version = url.match(/\/upload\/(v\d+)\//)?.[1];
  const after = version ? `${transform}/${version}/` : `${transform}/`;
  return url.replace(/\/upload\/(?:v\d+\/)?/, `/upload/${after}`);
}

type DialogueLine = {
  speaker: string;
  tl: string;
  ar?: string;
  en?: string;
  ids?: string[];
  side?: 'left' | 'right' | 'center';
};

type Props = {
  day: number;
  page: Page;
  items: Item[];
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

/** Native-language meaning; Arabic for now, English later. */
function lineMeaning(line: DialogueLine): string | undefined {
  return line.ar || undefined;
}

function linesFromStory(story: StoryDoc): DialogueLine[] {
  return story.lines.map((l: StoryLine) => ({
    speaker: l.speaker,
    tl: l.tl,
    ar: l.ar,
    en: l.en,
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
  situationEg,
  titleTl,
  nextHref = null,
  story: storyProp = null,
  storyId: storyIdProp = null,
}: Props) {
  void items;
  const router = useRouter();
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

  const [index, setIndex] = useState(0);
  /** User wants continuous autoplay; starts true. */
  const [wantPlay, setWantPlay] = useState(true);
  const [audioBusy, setAudioBusy] = useState(false);
  const [speed, setSpeed] = useState<StorySpeed>(1);
  /** Last line finished — highlight next-step arrow; stay on player. */
  const [atEnd, setAtEnd] = useState(false);

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
  const lineIsLearner = line ? isLearner(line.speaker, cast) : false;
  const meaning = line ? lineMeaning(line) : undefined;

  const characterLabel = useMemo(() => {
    if (!line || isLearner(line.speaker, cast)) return 'إنت بتقول';
    return `${line.speaker} بتتكلم`;
  }, [line, cast]);

  function reachEnd() {
    setAtEnd(true);
    setWantPlay(false);
    markPageDone(day, page.id);
  }

  function advanceOrFinish(fromIndex: number) {
    if (fromIndex + 1 >= total) {
      reachEnd();
    } else {
      setIndex(fromIndex + 1);
    }
  }

  function goNextPage() {
    if (!atEnd) return;
    markPageDone(day, page.id);
    router.push(nextHref ?? `/day/${day}`);
  }

  // Prefetch next line while current plays / whenever index changes.
  useEffect(() => {
    if (!resolvedStoryId || atEnd) return;
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
  }, [index, resolvedStoryId, lines, atEnd]);

  // Playback loop: plays current line when wantPlay; advances when audio ends.
  useEffect(() => {
    if (atEnd || !line || !wantPlay) {
      setAudioBusy(false);
      return;
    }

    const gen = ++playGenRef.current;
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      setAudioBusy(true);

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
  }, [index, wantPlay, atEnd, line, resolvedStoryId, total, day, page.id]);

  function togglePlay() {
    if (wantPlay) {
      setWantPlay(false);
      playGenRef.current += 1;
      const a = audioRef.current;
      if (a) a.pause();
      setAudioBusy(false);
      return;
    }
    if (atEnd) return;
    setWantPlay(true);
  }

  function cycleSpeed() {
    setSpeed((s) => {
      const i = STORY_SPEEDS.indexOf(s);
      return STORY_SPEEDS[(i + 1) % STORY_SPEEDS.length] ?? 1;
    });
  }

  const storyImageUrl =
    story && 'image' in story && story.image && typeof story.image === 'object'
      ? (story.image as { url?: string }).url
      : undefined;
  const [sceneSrc, setSceneSrc] = useState<string | null>(
    storyHeroDisplayUrl(storyImageUrl),
  );
  useEffect(() => {
    setSceneSrc(storyHeroDisplayUrl(storyImageUrl));
  }, [storyImageUrl]);

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

  const prev = index > 0 ? lines[index - 1] : null;
  const learnerLeft = (l: DialogueLine) =>
    l.side === 'left' || (l.side == null && isLearner(l.speaker, cast));
  const speedLabel =
    speed === 1 ? '1×' : speed === 0.75 ? '0.75×' : '1.25×';

  const speakerPanel = lineIsLearner
    ? 'bg-v2-action-tint text-v2-action-strong'
    : 'bg-v2-primary-tint text-v2-primary';
  const speakerBubble = (l: DialogueLine, current: boolean) => {
    const learner = isLearner(l.speaker, cast);
    return [
      'max-w-[90%] rounded-2xl px-4 py-3 text-start shadow',
      learner
        ? 'bg-v2-action-tint text-v2-action-strong'
        : 'bg-v2-primary-tint text-v2-primary',
      learnerLeft(l) ? 'ms-auto' : 'me-auto',
      current
        ? learner
          ? 'ring-2 ring-v2-action'
          : 'ring-2 ring-v2-primary'
        : 'max-w-[85%] opacity-50',
    ].join(' ');
  };

  return (
    <main className="relative flex min-h-dvh flex-col bg-v2-paper">
      <div className="relative h-[70vh] min-h-[280px] w-full overflow-hidden">
        <ImageSlot variant="cover" src={sceneSrc} fill fit="cover" />
        <DemoImageGenerate
          body={{ kind: 'story_scene', day }}
          label={sceneSrc ? 'Regenerate' : 'Generate'}
          onReady={(url) => setSceneSrc(storyHeroDisplayUrl(url))}
        />
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
          <span className="h-10 w-10" aria-hidden />
        </header>
        {situationEg ? (
          <p className="absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/35 px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-xs text-white">
            {situationEg}
          </p>
        ) : null}
        <div className="absolute inset-x-4 bottom-6 z-10 space-y-2">
          {prev ? (
            <div className={speakerBubble(prev, false)}>
              <p
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] text-sm"
              >
                {prev.tl}
              </p>
            </div>
          ) : null}
          {line ? (
            <div className={speakerBubble(line, true)}>
              <p
                dir="ltr"
                className="font-[family-name:var(--font-v2-target)] text-lg font-semibold"
              >
                {line.tl}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <section className="relative z-20 -mt-4 flex flex-1 flex-col rounded-t-3xl bg-v2-paper px-4 pb-8 pt-5">
        <div className={`rounded-2xl px-4 py-3 ${speakerPanel}`}>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm opacity-80">
            {characterLabel}
            {audioBusy && wantPlay ? ' · …' : ''}
          </p>
          {line ? (
            <>
              <p
                dir="ltr"
                className="mt-2 font-[family-name:var(--font-v2-target)] text-2xl font-semibold"
              >
                {line.tl}
              </p>
              {meaning ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-base">
                  {meaning}
                </p>
              ) : null}
            </>
          ) : null}
        </div>

        <p className="mt-4 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
          جملة {index + 1} من {total}
        </p>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-v2-rule">
          <div
            className="h-full rounded-full bg-gradient-to-l from-v2-action to-v2-primary"
            style={{ width: `${((index + 1) / Math.max(1, total)) * 100}%` }}
          />
        </div>

        <div className="mt-5 flex flex-col items-center gap-3">
          <div className="flex items-center justify-center gap-4">
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
              disabled={atEnd}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-v2-action text-2xl text-white shadow-[var(--shadow-v2-soft)] disabled:opacity-50"
              aria-label={wantPlay ? 'إيقاف' : 'تشغيل'}
            >
              {wantPlay ? '❚❚' : '▶'}
            </button>
          </div>
          <button
            type="button"
            onClick={goNextPage}
            disabled={!atEnd}
            className={[
              'inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-v2-chip px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold transition',
              atEnd
                ? 'bg-v2-action text-white shadow-[var(--shadow-v2-soft)]'
                : 'border border-v2-line bg-v2-card text-v2-primary opacity-60',
            ].join(' ')}
            aria-label="الصفحة الجاية"
          >
            <span aria-hidden>↓</span>
            الصفحة الجاية
          </button>
        </div>
      </section>
    </main>
  );
}
