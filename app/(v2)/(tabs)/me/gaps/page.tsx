import Link from 'next/link';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { listOpenWeakSpots } from '@/lib/v2/progress/weak/list';

export default async function GapsPage() {
  const user = await getCurrentV2User();
  let spots: Awaited<ReturnType<typeof listOpenWeakSpots>> = [];
  if (user && mongoConfigured()) {
    await connectMongo();
    spots = await listOpenWeakSpots(user.id, {
      includeImproving: true,
      limit: 5,
    });
  }

  return (
    <main className="flex flex-1 flex-col gap-4 px-1">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          نواقصك
        </h1>
        <Link
          href="/me"
          className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-action"
        >
          رجوع
        </Link>
      </div>
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        القواعد والأنماط اللي بتتلخبط فيها — مش الكلمات (الكلمات في الكروت).
      </p>
      {!spots.length ? (
        <p className="rounded-v2-card bg-v2-card px-4 py-6 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted shadow-[var(--shadow-v2-soft)]">
          مفيش نواقص مفتوحة دلوقتي. كمّل دروسك والكروت.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {spots.map((s) => (
            <li
              key={s.problem}
              className="rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-[family-name:var(--font-v2-arabic)] text-lg font-bold text-v2-primary">
                    {s.title_ar}
                  </h2>
                  <p
                    className="font-[family-name:var(--font-v2-target)] text-sm text-v2-ink-muted"
                    dir="ltr"
                  >
                    {s.title_tl}
                  </p>
                </div>
                <span className="rounded-full bg-v2-sand/40 px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] text-v2-ink-muted">
                  {s.status === 'improving' ? 'بتتحسّن' : 'مفتوح'}
                </span>
              </div>
              {s.explain_eg ? (
                <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
                  {s.explain_eg}
                </p>
              ) : null}
              {s.example ? (
                <p className="mt-2 rounded-lg bg-v2-sand/30 px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm text-amber-800" dir="ltr">
                  {s.example.wrong} → {s.example.right}
                </p>
              ) : null}
              <Link
                href={`/me/gaps/${encodeURIComponent(s.problem)}`}
                className="mt-3 inline-flex rounded-full bg-v2-action px-4 py-2 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-white"
              >
                اتمرّن عليها
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
