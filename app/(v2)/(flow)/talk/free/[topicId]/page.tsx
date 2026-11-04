import { FreeTalkSession } from '@/components/v2/convo';

export default async function FreeTalkPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId: raw } = await params;
  const topicId = decodeURIComponent(raw);
  return <FreeTalkSession topicId={topicId} />;
}
