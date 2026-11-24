'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { ImageSlot } from '@/components/v2/ImageSlot';

type Props = {
  name: string;
  tl: string;
  hiddenUntilAnswered: boolean;
  answered: boolean;
  avatarUrl?: string | null;
};

export function CharacterBubble({
  name,
  tl,
  hiddenUntilAnswered,
  answered,
  avatarUrl,
}: Props) {
  const showText = !hiddenUntilAnswered || answered;
  return (
    <div className="flex items-start gap-2.5">
      <ImageSlot
        variant="avatar"
        src={avatarUrl}
        alt={name}
        size={40}
        className="shrink-0"
      />
      <div className="max-w-[78%] rounded-v2-bubble border border-v2-line bg-v2-paper px-4 py-3 shadow-sm">
        <p className="truncate font-[family-name:var(--font-v2-ui)] text-xs font-semibold text-v2-ink-muted">
          {name}
        </p>
        {showText ? (
          <p
            className="mt-1 font-[family-name:var(--font-v2-target)] text-base font-medium text-v2-ink"
            dir="ltr"
          >
            {tl}
          </p>
        ) : (
          <AudioButton
            text={tl}
            label={`اسمع ${name}`}
            size="chip"
            className="mt-1"
          />
        )}
      </div>
    </div>
  );
}