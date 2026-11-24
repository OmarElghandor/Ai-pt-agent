import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import type { LessonPack } from '@/lib/v2/content/lesson';
import { findImageStepVisible } from '@/lib/v2/findImage/buildRounds';
import { rehydrateLessonImages } from '@/lib/v2/images/rehydrate';
import { FIND_IMAGE_MINUTES, minutesForMode } from '@/lib/v2/render/dayMinutes';
import { plainRt } from '@/lib/v2/render/speechTarget';

export type DayStepKind = 'page' | 'practice' | 'questions' | 'find_image';

/** One station in a day's map / summary / lesson_opened payload. */
export type DayStep = {
  id: string;
  kind: DayStepKind;
  title: string;
  subtitle?: string;
  minutes: number;
  href: string | null;
  /** False when the day does not show this station (e.g. hidden find_image). */
  present: boolean;
  /** Present stations used for home / day-map counts. */
  counted: boolean;
};

export type DayStepsResult = {
  day: number;
  steps: DayStep[];
  /** Presence list for `lesson_opened` (includes absent find_image). */
  openSteps: Array<{ id: string; present: boolean }>;
  /** Display rows: present steps only, same order as the day map. */
  displaySteps: DayStep[];
  questionsAfterId: string | null;
  unlockAfter: string;
  dayQuestionsTotal: number;
  lessonVersion: number | null;
  situation?: { tl: string; eg: string };
  totalCountedMinutes: number;
};

function withDev(href: string, dev: boolean): string {
  if (!dev) return href;
  return href.includes('?') ? `${href}&dev=1` : `${href}?dev=1`;
}

/**
 * Pure builder: same order and titles the day map showed before extraction.
 * Order: story → detail pages (no legacy scene) → find_image if visible →
 * day_questions.
 */
export function buildDayStepsFromPack(opts: {
  day: number;
  pack: LessonPack;
  lessonVersion?: number | null;
  dev?: boolean;
}): DayStepsResult {
  const day = opts.day;
  const dev = Boolean(opts.dev);
  const lessonPack = opts.pack;

  const pages = lessonPack.pages.filter((p) => p.role !== 'test');
  const storyIntro =
    pages.find((p) => p.preset === 'story' && p.role !== 'test') ??
    pages.find((p) => p.preset === 'story') ??
    pages[0];
  // Legacy packs may still carry a scene page — skip it at render time (00 2026-11-13).
  const detailPages = pages.filter(
    (p) => p.id !== storyIntro?.id && p.preset !== 'scene',
  );
  const lastDetailId = detailPages[detailPages.length - 1]?.id ?? null;
  const questionsId = 'day_questions';
  const findImageId = 'find_image';
  const showFindImage = findImageStepVisible(lessonPack.items ?? []);
  const unlockAfter = questionsId;
  const questionsAfterId = showFindImage
    ? findImageId
    : (lastDetailId ?? storyIntro?.id ?? null);

  const steps: DayStep[] = [];

  if (storyIntro) {
    steps.push({
      id: storyIntro.id,
      kind: 'page',
      title: 'القصة',
      subtitle: plainRt(storyIntro.title),
      minutes: minutesForMode(storyIntro.mode),
      href: withDev(`/day/${day}/page/${storyIntro.id}`, dev),
      present: true,
      counted: true,
    });
  }

  for (const page of detailPages) {
    const href = withDev(`/day/${day}/page/${page.id}`, dev);
    const present = page.id !== 'real_world' || Boolean(href);
    steps.push({
      id: page.id,
      kind: 'page',
      title: plainRt(page.title),
      subtitle: page.pill,
      minutes: minutesForMode(page.mode),
      href,
      present,
      counted: present,
    });
  }

  steps.push({
    id: findImageId,
    kind: 'find_image',
    title: 'لاقي الصورة',
    subtitle: 'اسمع واختار',
    minutes: FIND_IMAGE_MINUTES,
    href: showFindImage
      ? withDev(`/day/${day}/find-image`, dev)
      : null,
    present: showFindImage,
    counted: showFindImage,
  });

  steps.push({
    id: questionsId,
    kind: 'questions',
    title: 'أسئلة اليوم',
    subtitle: 'اختبرني',
    minutes: 3,
    href: withDev(`/day/${day}/questions`, dev),
    present: true,
    counted: true,
  });

  const openSteps = steps.map((s) => ({ id: s.id, present: s.present }));
  const displaySteps = steps.filter((s) => s.present);
  // Match أسئلة اليوم session filter (exclude practice-only questions).
  const dayQuestionsTotal = Array.isArray(lessonPack.questions)
    ? lessonPack.questions.filter((q) => {
        const u = (q as { use?: string }).use;
        return u !== 'practice';
      }).length
    : 0;
  const totalCountedMinutes = displaySteps
    .filter((s) => s.counted)
    .reduce((sum, s) => sum + s.minutes, 0);

  return {
    day,
    steps,
    openSteps,
    displaySteps,
    questionsAfterId,
    unlockAfter,
    dayQuestionsTotal,
    lessonVersion: opts.lessonVersion ?? null,
    situation: lessonPack.lesson.situation,
    totalCountedMinutes,
  };
}

/** Load published (or latest) lesson and build the shared day-step list. */
export async function buildDaySteps(opts: {
  day: number;
  dev?: boolean;
}): Promise<DayStepsResult | null> {
  const published =
    (await getPublishedLesson(opts.day)) ??
    (await getLatestLessonPack(opts.day));
  if (!published) return null;

  const lessonPack = await rehydrateLessonImages({
    day: published.day,
    targetLang: published.target_lang,
    version: published.version,
    pack: published.pack,
  });

  return buildDayStepsFromPack({
    day: published.day,
    pack: lessonPack,
    lessonVersion: published.version,
    dev: opts.dev,
  });
}
