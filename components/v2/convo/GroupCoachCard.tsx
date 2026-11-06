'use client';

import { useState } from 'react';
import type { ConvoItemSurface } from '@/lib/v2/convo/pack';
import { AudioButton } from '@/components/v2/AudioButton';

type Mini = {
  item_id: string;
  coach_intro_eg: string;
};

type Props = {
  introEg?: string;
  cardIds: string[];
  coachIntros: Mini[];
  surfaceById: Map<string, ConvoItemSurface>;
};

/**
 * One group-start coach card: intro_eg + horizontal mini vocab cards
 * (Stitch l1_onde_fica). Memory tip behind «إزاي أفتكرها؟».
 */
export function GroupCoachCard({
  introEg,
  cardIds,
  coachIntros,
  surfaceById,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const introById = new Map(
    coachIntros.map((c) => [c.item_id, c.coach_intro_eg] as const),
  );

  return (
    <div
      className="rounded-[var(--ft-radius-card,1.75rem)] border border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-surface,#FBF8F3)] p-4 shadow-[var(--ft-shadow-soft,0_8px_24px_rgba(32,42,37,0.06))]"
      dir="rtl"
    >
      {introEg ? (
        <p className="mb-3 flex gap-2 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[14px] leading-6 text-[color:var(--ft-ink,#202A25)]">
          <span aria-hidden className="mt-0.5 shrink-0 text-[18px]">
            💡
          </span>
          <span>{introEg}</span>
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1" dir="ltr">
        {cardIds.map((id) => {
          const s = surfaceById.get(id);
          const tip = introById.get(id);
          const open = openId === id;
          return (
            <div
              key={id}
              className="min-w-[7.5rem] flex-1 rounded-2xl border border-[color:var(--ft-border,#E5DED5)] bg-white px-3 py-3"
            >
              <div className="flex items-start justify-between gap-1">
                <p className="font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[15px] font-semibold text-[color:var(--ft-ink,#202A25)]">
                  {s?.tl ?? id}
                </p>
                {s?.tl ? (
                  <AudioButton text={s.tl} size="chip" label={`اسمع ${s.tl}`} />
                ) : null}
              </div>
              {s?.say ? (
                <p
                  className="mt-1 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[12px] text-[color:var(--ft-text-secondary,#666963)]"
                  dir="rtl"
                >
                  {s.say}
                </p>
              ) : null}
              {tip ? (
                <button
                  type="button"
                  className="mt-2 w-full text-start font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[11px] font-medium text-[color:var(--ft-sage,#6B7F6E)]"
                  dir="rtl"
                  onClick={() => setOpenId(open ? null : id)}
                >
                  إزاي أفتكرها؟
                </button>
              ) : null}
              {open && tip ? (
                <p
                  className="mt-1 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[11px] leading-5 text-[color:var(--ft-text-secondary,#666963)]"
                  dir="rtl"
                >
                  {tip}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
