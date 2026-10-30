import { DeckDetailView } from '@/components/v2/cards/DeckDetailView';
import { dayOverrideFromSearch } from '@/lib/v2/progress/learnerDay';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string }>;
};

export default async function DeckDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const dayOverride = sp.day != null ? dayOverrideFromSearch(sp.day) : null;

  return (
    <DeckDetailView
      deckId={decodeURIComponent(id)}
      dayOverride={dayOverride}
    />
  );
}
