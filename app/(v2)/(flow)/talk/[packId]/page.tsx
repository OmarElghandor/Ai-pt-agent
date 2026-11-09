import { TalkSession } from '@/components/v2/convo';

export default async function TalkPage({
  params,
}: {
  params: Promise<{ packId: string }>;
}) {
  const { packId: raw } = await params;
  const packId = decodeURIComponent(raw);

  return <TalkSession packId={packId} />;
}
