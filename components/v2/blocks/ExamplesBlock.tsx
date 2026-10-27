'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function ExamplesBlock({ block }: { block: Extract<Block, { type: 'examples' }> }) {
  const chrome = useBlockChrome();
  return (
    <div data-target={block.id} className="space-y-2">
      {block.items.map((entry, index) => {
        const state = chrome.partState(block.id, `item:${index}`);
        return (
          <div
            key={index}
            data-target={`${block.id}/item:${index}`}
            className={['rounded-v2-row border border-v2-rule bg-v2-card p-2', partClass(state)].join(' ')}
          >
            <ContentLine
              item={chrome.items.get(entry.ref)}
              media={entry.media}
              onPlay={chrome.onPlay}
            />
          </div>
        );
      })}
    </div>
  );
}
