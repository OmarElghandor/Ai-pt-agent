'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { itemTargetText } from '@/lib/v2/render/speechTarget';
import { MediaTile } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

function pct(value: number): string {
  return `${value <= 1 ? value * 100 : value}%`;
}

export function SceneBlock({ block }: { block: Extract<Block, { type: 'scene' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div
      data-target={block.id}
      className={['relative min-h-48 overflow-hidden rounded-v2-card border border-v2-ink bg-v2-rule', partClass(state)].join(' ')}
    >
      <div className="absolute start-2 top-2">
        <MediaTile image={block.image} />
      </div>
      {block.hotspots.map((spot, index) => {
        const spotState = chrome.partState(block.id, `item:${index}`);
        const item = chrome.items.get(spot.ref);
        const tl = itemTargetText(item);
        return (
          <button
            key={index}
            type="button"
            data-target={`${block.id}/item:${index}`}
            className={[
              'absolute max-w-[40%] rounded-v2-chip bg-v2-card px-2 py-1 text-xs shadow-[2px_2px_0_rgba(18,35,90,0.12)]',
              partClass(spotState),
            ].join(' ')}
            style={{ left: pct(spot.x), top: pct(spot.y) }}
            onClick={() => {
              if (tl) chrome.onPlay(tl, 'pt');
            }}
          >
            {tl}
          </button>
        );
      })}
    </div>
  );
}
