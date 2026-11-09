import { ReviewSession } from '@/components/v2/cards/ReviewSession';
import { getCurrentV2UserId } from '@/lib/v2/auth/session';
import { hydrateCardFaces } from '@/lib/v2/decks';
import {
  dayOverrideFromSearch,
  resolveLearnerDay,
} from '@/lib/v2/progress/learnerDay';

type Props = {
  searchParams: Promise<{ day?: string; deck?: string; item?: string }>;
};

export default async function CardsReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const dayOverride = sp.day != null ? dayOverrideFromSearch(sp.day) : null;
  const itemId = sp.item ? decodeURIComponent(sp.item) : undefined;
  const deckId = sp.deck ? decodeURIComponent(sp.deck) : undefined;

  let previewFace = null;
  const userId = await getCurrentV2UserId();
  if (itemId && userId) {
    const day = await resolveLearnerDay(userId, dayOverride);
    const faces = await hydrateCardFaces([itemId], day);
    previewFace = faces.get(itemId) ?? null;
  }

  return (
    <ReviewSession
      dayOverride={dayOverride}
      deckId={deckId}
      itemId={itemId}
      previewFace={previewFace}
    />
  );
}
