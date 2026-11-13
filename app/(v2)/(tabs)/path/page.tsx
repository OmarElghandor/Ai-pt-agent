import { PathRoadmap } from '@/components/v2/path/PathRoadmap';
import { HomeSummaryHeader } from '@/components/v2/home/HomeSummaryHeader';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { buildPathPayload, buildWeekPathPayload, weekDays } from '@/lib/v2/path';
import {
  mergeLearnerPath,
  resolveLearnerCurrentDay,
} from '@/lib/v2/progress/learnerPath';
import { getImageByKey } from '@/lib/v2/images';
import { storySceneKey } from '@/lib/v2/images/keys';
import { buildMeSummary } from '@/lib/v2/progress/summary';

export default async function PathPage() {
  const { days } = await buildPathPayload();
  const user = await getCurrentV2User();

  let learnerDays = days.map((d) => ({
    ...d,
    learner_status: (d.day === 1 && d.href ? 'available' : 'locked') as
      | 'locked'
      | 'scheduled'
      | 'available'
      | 'in_progress'
      | 'completed',
    opens_on: null as string | null,
    practised: false,
    bakra: false,
  }));

  let deckLeft: number | null = null;
  let deckTotal: number | null = null;

  if (user && mongoConfigured()) {
    await connectMongo();
    learnerDays = await mergeLearnerPath({
      userId: user.id,
      timezone: user.timezone,
      days,
    });
    try {
      const summary = await buildMeSummary(user);
      deckLeft = summary.deck.left;
      deckTotal = summary.deck.total;
    } catch {
      /* path stays usable without deck counts */
    }
  }

  const weekNum = buildWeekPathPayload(days).week;
  const weekRows = weekDays(learnerDays, weekNum);
  const currentDay = resolveLearnerCurrentDay(learnerDays);

  let coverUrl: string | null = null;
  if (currentDay && mongoConfigured()) {
    try {
      const img = await getImageByKey(storySceneKey(currentDay));
      if (img?.status === 'ready' && img.url) coverUrl = img.url;
    } catch {
      /* mint gradient placeholder */
    }
  }

  if (!weekRows.length) {
    return (
      <main className="relative -mx-4 -mt-4 flex flex-1 flex-col gap-4 px-4">
        {user ? (
          <HomeSummaryHeader
            name={user.name}
            image={user.image}
            initialStreak={user.streak?.current ?? 0}
          />
        ) : null}
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-primary">
          المسار
        </h1>
        <p className="rounded-v2-card bg-v2-card px-4 py-6 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted shadow-[var(--shadow-v2-soft)]">
          مفيش دروس في قاعدة البيانات لسه. الأيام بتفتح لما يبقى في درس محفوظ.
        </p>
      </main>
    );
  }

  return (
    <main className="relative -mx-4 -mt-4 flex flex-1 flex-col px-4">
      {user ? (
        <HomeSummaryHeader
          name={user.name}
          image={user.image}
          initialStreak={user.streak?.current ?? 0}
        />
      ) : null}
      <PathRoadmap
        week={weekNum}
        days={weekRows}
        currentDay={currentDay}
        coverUrl={coverUrl}
        deckLeft={deckLeft}
        deckTotal={deckTotal}
      />
    </main>
  );
}
