import { CardsHome } from '@/components/v2/cards/CardsHome';
import { dayOverrideFromSearch } from '@/lib/v2/progress/learnerDay';

type Props = {
  searchParams: Promise<{ day?: string }>;
};

export default async function CardsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const dayOverride = sp.day != null ? dayOverrideFromSearch(sp.day) : null;
  return <CardsHome dayOverride={dayOverride} />;
}
