import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DayMap, type DayMapStep } from '@/components/v2/player/DayMap';
import { LessonProgressBootstrap } from '@/components/v2/player/LessonProgressBootstrap';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { findImageStepVisible } from '@/lib/v2/findImage/buildRounds';
import { getPublishedPack } from '@/lib/v2/generation/pack/save';
import { rehydrateLessonImages } from '@/lib/v2/images/rehydrate';
import {
  FIND_IMAGE_MINUTES,
  minutesForMode,
  PRACTICE_MINUTES,
} from '@/lib/v2/render/dayMinutes';
import { plainRt } from '@/lib/v2/render/speechTarget';

export default async function DayMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ day: string }>;
  searchParams: Promise<{ dev?: string }>;
}) {
  const { day: raw } = await params;
  const sp = await searchParams;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1) notFound();

  const dev = sp.dev === '1';
  const published =
    (await getPublishedLesson(day)) ?? (await getLatestLessonPack(day));
  if (!published) {
    return (
      <main className="px-4 py-8">
        <Link href="/path" className="text-sm">
          المسار
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">
          الدرس مش متاح دلوقتي.
        </p>
      </main>
    );
  }

  const pack = await getPublishedPack(day);
  const lessonPack = await rehydrateLessonImages({
    day: published.day,
    targetLang: published.target_lang,
    version: published.version,
    pack: published.pack,
  });
  const pages = lessonPack.pages.filter((p) => p.role !== 'test');
  const storyIntro =
    pages.find((p) => p.preset === 'story' && p.role !== 'test') ??
    pages.find((p) => p.preset === 'story') ??
    pages[0];
  const detailPages = pages.filter((p) => p.id !== storyIntro?.id);
  const lastDetailId = detailPages[detailPages.length - 1]?.id ?? null;
  const questionsId = 'day_questions';
  const findImageId = 'find_image';
  const showFindImage = findImageStepVisible(lessonPack.items ?? []);
  const unlockAfter = questionsId;
  const questionsAfterId = showFindImage
    ? findImageId
    : (lastDetailId ?? storyIntro?.id ?? null);
  const devUnlock = dev;
  const withDev = (href: string) => {
    if (!dev) return href;
    return href.includes('?') ? `${href}&dev=1` : `${href}?dev=1`;
  };

  const steps: DayMapStep[] = [];

  if (storyIntro) {
    steps.push({
      id: storyIntro.id,
      kind: 'page',
      title: 'القصة',
      subtitle: plainRt(storyIntro.title),
      minutes: minutesForMode(storyIntro.mode),
      href: withDev(`/day/${day}/page/${storyIntro.id}`),
    });
  }

  for (const page of detailPages) {
    steps.push({
      id: page.id,
      kind: 'page',
      title: plainRt(page.title),
      subtitle: page.pill,
      minutes: minutesForMode(page.mode),
      href: withDev(`/day/${day}/page/${page.id}`),
    });
  }

  if (showFindImage) {
    steps.push({
      id: findImageId,
      kind: 'find_image',
      title: 'لاقي الصورة',
      subtitle: 'اسمع واختار',
      minutes: FIND_IMAGE_MINUTES,
      href: withDev(`/day/${day}/find-image`),
    });
  }

  steps.push({
    id: questionsId,
    kind: 'questions',
    title: 'أسئلة اليوم',
    subtitle: 'اختبرني',
    minutes: 3,
    href: withDev(`/day/${day}/questions`),
  });

  steps.push({
    id: 'practice',
    kind: 'practice',
    title: 'تدريب',
    subtitle: 'محادثة',
    minutes: PRACTICE_MINUTES,
    href: pack ? `/practice/${day}${devUnlock ? '?dev=1' : ''}` : null,
  });

  const openSteps = steps.map((s) => ({
    id: s.id,
    present: s.id !== 'real_world' || Boolean(s.href),
  }));
  // Mark find_image absent when hidden; real_world pages already filtered by content.
  if (!showFindImage) {
    openSteps.push({ id: 'find_image', present: false });
  }

  const dayQuestionsTotal = Array.isArray(lessonPack.questions)
    ? lessonPack.questions.length
    : 0;

  return (
    <>
      <LessonProgressBootstrap
        day={published.day}
        steps={openSteps}
        dayQuestionsTotal={dayQuestionsTotal}
        lessonVersion={published.version}
      />
      <DayMap
        day={published.day}
        situation={lessonPack.lesson.situation}
        steps={steps}
        lastPageId={unlockAfter}
        practiceDevUnlock={devUnlock}
        hasPublishedPack={Boolean(pack)}
        questionsAfterId={questionsAfterId}
      />
    </>
  );
}
