import { CreateDeckFlow } from '@/components/v2/cards/create/CreateDeckFlow';
import { dayOverrideFromSearch } from '@/lib/v2/progress/learnerDay';

type Props = {
  searchParams: Promise<{ day?: string }>;
};

export default async function CreateCustomDeckPage({ searchParams }: Props) {
  const sp = await searchParams;
  const dayOverride = sp.day != null ? dayOverrideFromSearch(sp.day) : null;
  return <CreateDeckFlow dayOverride={dayOverride} />;
}
