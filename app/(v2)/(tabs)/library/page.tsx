import { getCurrentV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { unlockedLibraryDays } from '@/lib/v2/progress/libraryUnlock';
import { loadPlan } from '@/lib/v2/generation/lesson/plan';

export default async function LibraryPage() {
  const user = await getCurrentV2User();
  let unlocked = new Set<number>();
  if (user && mongoConfigured()) {
    await connectMongo();
    unlocked = new Set(await unlockedLibraryDays({ userId: user.id }));
  }

  const plan = loadPlan();
  const rows = plan.days.slice(0, 54).map((d) => {
    const open = unlocked.has(d.day);
    return {
      day: d.day,
      title_tl: d.title_tl,
      title_ar: d.title_ar,
      open,
    };
  });

  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
        المكتبة
      </h1>
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        الصفحات بتفتح لما توصل لليوم اللي بيعلّمها على المسار.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.day}
            className={[
              'rounded-v2-card px-4 py-3 font-[family-name:var(--font-v2-arabic)] shadow-[var(--shadow-v2-soft)]',
              row.open
                ? 'bg-v2-card text-v2-ink'
                : 'bg-v2-paper-deep/60 text-v2-ink-muted',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                يوم {row.day} · {row.title_ar}
              </span>
              <span className="text-xs">
                {row.open ? 'مفتوح' : 'مقفول'}
              </span>
            </div>
            <p
              className="mt-0.5 font-[family-name:var(--font-v2-target)] text-sm"
              dir="ltr"
            >
              {row.title_tl}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
