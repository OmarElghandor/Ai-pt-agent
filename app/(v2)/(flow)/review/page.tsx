import { DailyReviewSession } from '@/components/v2/practice/DailyReviewSession';
import { getCurrentV2User } from '@/lib/v2/auth/session';
import { canRegenerateReview } from '@/lib/v2/practice/regenerate';

export default async function DailyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; fixture?: string }>;
}) {
  const sp = await searchParams;
  const dayRaw = sp.day ? Number(sp.day) : null;
  const dayOverride =
    dayRaw != null && Number.isFinite(dayRaw) && dayRaw > 0 ? dayRaw : null;

  const user = await getCurrentV2User();
  const fixture =
    sp.fixture === 'all-types' && user?.role === 'admin' ? 'all-types' : null;

  return (
    <DailyReviewSession
      dayOverride={dayOverride}
      fixture={fixture}
      learnerName={user?.name?.split(' ')[0]}
      canRegenerate={Boolean(user) && canRegenerateReview(user?.role)}
    />
  );
}