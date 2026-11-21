import { DailyReviewSession } from '@/components/v2/practice/DailyReviewSession';

export default async function DailyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const sp = await searchParams;
  const dayRaw = sp.day ? Number(sp.day) : null;
  const dayOverride =
    dayRaw != null && Number.isFinite(dayRaw) && dayRaw > 0 ? dayRaw : null;
  return <DailyReviewSession dayOverride={dayOverride} />;
}
