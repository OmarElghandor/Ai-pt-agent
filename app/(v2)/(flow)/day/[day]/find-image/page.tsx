import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FindImageStep } from '@/components/v2/player/FindImageStep';
import {
  getLatestLessonPack,
  getPublishedLesson,
} from '@/lib/v2/content/getPublishedLesson';
import { buildFindImageRounds } from '@/lib/v2/findImage/buildRounds';
import { rehydrateLessonImages } from '@/lib/v2/images/rehydrate';

export default async function FindImagePage({
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
  const withDev = (href: string) => {
    if (!dev) return href;
    return href.includes('?') ? `${href}&dev=1` : `${href}?dev=1`;
  };

  const published =
    (await getPublishedLesson(day)) ?? (await getLatestLessonPack(day));
  if (!published) {
    return (
      <main className="px-4 py-8">
        <Link href={withDev(`/day/${day}`)} className="text-sm">
          رجوع
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">
          الدرس مش متاح دلوقتي.
        </p>
      </main>
    );
  }

  const lessonPack = await rehydrateLessonImages({
    day: published.day,
    targetLang: published.target_lang,
    version: published.version,
    pack: published.pack,
  });
  const rounds = buildFindImageRounds(lessonPack.items ?? []);
  if (!rounds) {
    redirect(withDev(`/day/${day}/questions`));
  }

  return (
    <FindImageStep
      day={day}
      rounds={rounds}
      situationEg={lessonPack.lesson.situation?.eg}
      titleTl={lessonPack.lesson.situation?.tl}
      nextHref={withDev(`/day/${day}/questions`)}
    />
  );
}
