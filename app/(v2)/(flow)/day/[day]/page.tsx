import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DayMap, type DayMapStep } from '@/components/v2/player/DayMap';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { getPublishedPack } from '@/lib/v2/generation/pack/save';
import { minutesForMode, PRACTICE_MINUTES } from '@/lib/v2/render/dayMinutes';
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
  const pages = published.pack.pages.filter((p) => p.role !== 'test');
  const storyIntro =
    pages.find((p) => p.preset === 'story' && p.role !== 'test') ??
    pages.find((p) => p.preset === 'story') ??
    pages[0];
  const detailPages = pages.filter((p) => p.id !== storyIntro?.id);
  const lastDetailId = detailPages[detailPages.length - 1]?.id ?? null;
  const storyTestStepId = storyIntro ? `${storyIntro.id}__test` : null;
  const questionsId = 'day_questions';
  const unlockAfter = questionsId;
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

  if (storyIntro && storyTestStepId) {
    steps.push({
      id: storyTestStepId,
      kind: 'story_test',
      title: 'القصة تاني: من غير ترجمة',
      subtitle: 'اسمعها تاني وبعدين أسئلة',
      minutes: 3,
      href: withDev(`/day/${day}/page/${storyIntro.id}?mode=test`),
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

  return (
    <DayMap
      day={published.day}
      situation={published.pack.lesson.situation}
      steps={steps}
      lastPageId={unlockAfter}
      practiceDevUnlock={devUnlock}
      hasPublishedPack={Boolean(pack)}
      storyTestAfterId={lastDetailId}
      questionsAfterId={storyTestStepId}
    />
  );
}
