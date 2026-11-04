'use client';

import { AudioButton } from '@/components/v2/AudioButton';
import { ImageSlot } from '@/components/v2/ImageSlot';
import type { ConvoItemGlyph } from '@/lib/v2/convo/pack';

type Props = {
  tl: string;
  say?: string;
  glyph?: ConvoItemGlyph;
};

function GlyphArrow({ glyph }: { glyph: 'left' | 'right' | 'straight' }) {
  const icon =
    glyph === 'left'
      ? 'arrow_back'
      : glyph === 'right'
        ? 'arrow_forward'
        : 'arrow_upward';
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-v2-primary/10 text-v2-primary"
      aria-hidden
    >
      <span className="material-symbols-rounded text-[28px]">{icon}</span>
    </div>
  );
}

/** Inline item card when a group starts (09 §10): image/arrow, say, audio. */
export function ItemCard({ tl, say, glyph = 'place' }: Props) {
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-v2-line bg-v2-card px-3 py-2.5 shadow-[var(--shadow-v2-soft)]">
      {glyph === 'place' ? (
        <ImageSlot variant="tile" placeholderIcon="place" />
      ) : (
        <GlyphArrow glyph={glyph} />
      )}
      <div className="min-w-0 flex-1 text-end">
        <p
          dir="ltr"
          lang="pt"
          className="text-start font-[family-name:var(--font-v2-target)] text-[15px] font-semibold text-v2-primary"
        >
          {tl}
        </p>
        {say ? (
          <p
            dir="rtl"
            className="mt-0.5 font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink-muted"
          >
            {say}
          </p>
        ) : null}
      </div>
      <AudioButton text={tl} lang="pt" size="chip" label="اسمع" />
    </div>
  );
}
