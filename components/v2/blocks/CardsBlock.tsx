'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function CardsBlock({ block }: { block: Extract<Block, { type: 'cards' }> }) {
  const chrome = useBlockChrome();
  const cols = block.cols ?? 2;
  return (
    <div
      data-target={block.id}
      className={cols === 4 ? 'grid grid-cols-4 gap-3' : cols === 3 ? 'grid grid-cols-3 gap-3' : 'grid grid-cols-2 gap-3'}
    >
      {block.items.map((ref, index) => {
        const state = chrome.partState(block.id, `item:${index}`);
        return (
          <div
            key={ref}
            data-target={`${block.id}/item:${index}`}
            className={['min-w-0 rounded-v2-row border border-v2-line bg-v2-card p-3', partClass(state)].join(' ')}
          >
            {block.numbered ? (
              <p className="mb-1 font-[family-name:var(--font-v2-ui)] text-xs text-v2-ink-muted">
                {index + 1}
              </p>
            ) : null}
            <ContentLine item={chrome.items.get(ref)} onPlay={chrome.onPlay} />
          </div>
        );
      })}
    </div>
  );
}
