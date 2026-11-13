import { PathRoadmap } from '@/components/v2/path/PathRoadmap';
import { HomeSummaryHeader } from '@/components/v2/home/HomeSummaryHeader';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { buildPathPayload, buildWeekPathPayload, weekDays } from '@/lib/v2/path';
import {
  mergeLearnerPath,
  resolveLearnerCurrentDay,
} from '@/lib/v2/progress/learnerPath';

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

  if (user && mongoConfigured()) {
    await connectMongo();
    learnerDays = await mergeLearnerPath({
      userId: user.id,
      timezone: user.timezone,
      days,
    });
  }

  const weekNum = buildWeekPathPayload(days).week;
  const weekRows = weekDays(learnerDays, weekNum);
  const currentDay = resolveLearnerCurrentDay(learnerDays);

  if (!weekRows.length) {
    return (
      <main className="flex flex-1 flex-col gap-4">
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
    <main className="flex flex-1 flex-col">
      <HomeSummaryHeader />
      <PathRoadmap
        week={weekNum}
        days={weekRows}
        currentDay={currentDay}
      />
    </main>
  );
}
