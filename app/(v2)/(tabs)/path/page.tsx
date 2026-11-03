import { PathRoadmap } from '@/components/v2/path/PathRoadmap';
import { buildPathPayload, buildWeekPathPayload } from '@/lib/v2/path';

export default async function PathPage() {
  const { days } = await buildPathPayload();
  const week = buildWeekPathPayload(days);

  if (!week.days.length) {
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
      <PathRoadmap
        week={week.week}
        days={week.days}
        currentDay={week.currentDay}
      />
    </main>
  );
}
