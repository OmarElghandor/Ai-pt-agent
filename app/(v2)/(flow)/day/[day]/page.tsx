import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DayMap, type DayMapStep } from '@/components/v2/player/DayMap';
import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
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

  const published = await getPublishedLesson(day);
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
  const pageIds = published.pack.pages.map((p) => p.id);
  const lastPageId = pageIds[pageIds.length - 1] ?? null;
  const devUnlock = sp.dev === '1';

  const steps: DayMapStep[] = published.pack.pages.map((page) => ({
    id: page.id,
    kind: 'page',
    title: plainRt(page.title),
    subtitle: page.pill,
    minutes: minutesForMode(page.mode),
    href: `/day/${day}/page/${page.id}`,
  }));
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
      lastPageId={lastPageId}
      practiceDevUnlock={devUnlock}
      hasPublishedPack={Boolean(pack)}
    />
  );
}
