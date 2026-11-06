import { FreeTalkSession } from '@/components/v2/convo';

export default async function FreeTalkPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ day?: string }>;
}) {
  const { topicId: raw } = await params;
  const topicId = decodeURIComponent(raw);
  const sp = await searchParams;
  const dayRaw = sp.day ? Number(sp.day) : NaN;
  const day =
    Number.isInteger(dayRaw) && dayRaw > 0 ? dayRaw : null;
  return <FreeTalkSession topicId={topicId} day={day} />;
}
