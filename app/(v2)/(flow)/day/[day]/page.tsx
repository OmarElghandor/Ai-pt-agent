import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DayMap } from '@/components/v2/player/DayMap';
import { LessonProgressBootstrap } from '@/components/v2/player/LessonProgressBootstrap';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { buildDaySteps } from '@/lib/v2/progress/daySteps';
import { createMongoProgressStore } from '@/lib/v2/progress/events';
import { buildStepView } from '@/lib/v2/progress/stepView';

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
  const built = await buildDaySteps({ day, dev });
  if (!built) {
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

  let serverDoneIds: string[] = [];
  let nextStepId: string | null = null;

  const userId = await getCurrentV2UserId();
  if (userId && mongoConfigured()) {
    await connectMongo();
    const store = createMongoProgressStore();
    const progress = await store.getLesson(userId, 'pt-PT', day);
    const view = buildStepView(progress, built.steps);
    serverDoneIds = (progress?.steps ?? [])
      .filter((s) => s.status === 'done')
      .map((s) => s.id);
    nextStepId = view.nextStep?.id ?? null;
  } else {
    const view = buildStepView(null, built.steps);
    nextStepId = view.nextStep?.id ?? null;
  }

  return (
    <>
      <LessonProgressBootstrap
        day={built.day}
        steps={built.openSteps}
        dayQuestionsTotal={built.dayQuestionsTotal}
        lessonVersion={built.lessonVersion ?? undefined}
      />
      <DayMap
        day={built.day}
        situation={built.situation}
        steps={built.displaySteps.map((s) => ({
          id: s.id,
          kind: s.kind,
          title: s.title,
          subtitle: s.subtitle,
          minutes: s.minutes,
          href: s.href,
          counted: s.counted,
        }))}
        lastPageId={built.unlockAfter}
        practiceDevUnlock={dev}
        hasPublishedPack={built.hasPublishedPack}
        questionsAfterId={built.questionsAfterId}
        serverDoneIds={serverDoneIds}
        nextStepId={nextStepId}
      />
    </>
  );
}
