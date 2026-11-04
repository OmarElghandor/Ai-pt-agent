'use client';

import { ImageSlot } from '@/components/v2/ImageSlot';
import type { ConvoSceneCardVisual } from '@/lib/v2/convo/pack';

type Props = {
  visual: ConvoSceneCardVisual;
  /** Hotspot ids to highlight (e.g. current item). */
  activeHotspotIds?: string[];
  hidden?: boolean;
};

/** Simple scene_card with hotspot dots for non-map packs (T1.13). */
export function SceneCardVisual({
  visual,
  activeHotspotIds = [],
  hidden,
}: Props) {
  if (hidden) return null;
  const active = new Set(activeHotspotIds);

  return (
    <div className="relative shrink-0 border-b border-v2-line/60 px-3 py-3">
      <div className="relative overflow-hidden rounded-2xl">
        <ImageSlot
          variant="cover"
          placeholderIcon="image"
          // image_key is a content key; real URLs come later
          alt={visual.image_key}
        />
        <div className="absolute inset-0 flex flex-wrap content-end justify-center gap-2 p-3">
          {visual.hotspots.map((h) => (
            <span
              key={h.id}
              className={[
                'rounded-full px-2 py-0.5 font-[family-name:var(--font-v2-ui)] text-[10px] font-semibold',
                active.has(h.id)
                  ? 'bg-v2-action text-white'
                  : 'bg-white/90 text-v2-primary',
              ].join(' ')}
            >
              {h.item_id.replace(/^word\.|^phrase\./, '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
