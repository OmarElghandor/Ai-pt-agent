import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PracticeSession } from '@/components/v2/practice/PracticeSession';
import { getPublishedPack } from '@/lib/v2/generation/pack/save';

export default async function PracticePage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const { day: raw } = await params;
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1) notFound();

  const pack = await getPublishedPack(day);
  if (!pack) {
    return (
      <main className="px-4 py-8">
        <Link href={`/day/${day}`} className="text-sm">
          رجوع
        </Link>
        <p className="mt-4 font-[family-name:var(--font-v2-arabic)]">
          التدريب مش جاهز لسه.
        </p>
      </main>
    );
  }

  return <PracticeSession day={day} pack={pack.data} />;
}
