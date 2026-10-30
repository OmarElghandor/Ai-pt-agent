import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PagePlayer } from '@/components/v2/player/PagePlayer';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { buildPlayerLesson } from '@/lib/v2/render/forms';

export default async function LessonPlayerPage({
  params,
}: {
  params: Promise<{ day: string; pageId: string }>;
}) {
  const { day: raw, pageId } = await params;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1) notFound();

  const published = await getPublishedLesson(day);
  if (!published) {
    return (
      <main className="px-4 py-8">
        <Link href={`/day/${day}`} className="text-sm">
          رجوع
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">الدرس مش متاح دلوقتي.</p>
      </main>
    );
  }

  const view = buildPlayerLesson(published.pack);
  const pageIndex = view.pages.findIndex((entry) => entry.id === pageId);
  if (pageIndex < 0) notFound();
  const page = view.pages[pageIndex]!;
  const nextPage = view.pages[pageIndex + 1];
  const isLastPage = pageIndex >= view.pages.length - 1;
  const nextHref = nextPage ? `/day/${day}/page/${nextPage.id}` : null;

  return (
    <PagePlayer
      day={view.day}
      page={page}
      items={view.items}
      questions={view.questions}
      forms={view.forms}
      nextHref={nextHref}
      isLastPage={isLastPage}
    />
  );
}
