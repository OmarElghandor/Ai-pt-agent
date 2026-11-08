import { FreeTalkSession } from '@/components/v2/convo';

export default async function FreeTalkPage({
  params,
  searchParams,
}: {
  params: Promise<{ topicId: string }>;
  searchParams: Promise<{ day?: string; level?: string }>;
}) {
  const { topicId: raw } = await params;
  const topicId = decodeURIComponent(raw);
  const sp = await searchParams;
  const dayRaw = sp.day ? Number(sp.day) : NaN;
  const day =
    Number.isInteger(dayRaw) && dayRaw > 0 ? dayRaw : null;
  const levelRaw = sp.level ? Number(sp.level) : NaN;
  const level =
    Number.isInteger(levelRaw) && levelRaw > 0 ? levelRaw : null;
  return <FreeTalkSession topicId={topicId} day={day} level={level} />;
}
