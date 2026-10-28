'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function VsPairsBlock({ block }: { block: Extract<Block, { type: 'vs_pairs' }> }) {
  const chrome = useBlockChrome();
  return (
    <div data-target={block.id} className="space-y-2">
      {block.pairs.map((pair, index) => {
        const state = chrome.partState(block.id, `item:${index}`);
        return (
          <div
            key={index}
            data-target={`${block.id}/item:${index}`}
            className={['rounded-v2-card bg-v2-card shadow-[var(--shadow-v2-soft)] p-2', partClass(state)].join(' ')}
          >
            <div className="grid grid-cols-2 items-start gap-3" dir="ltr">
              <ContentLine item={chrome.items.get(pair.left)} onPlay={chrome.onPlay} />
              <ContentLine item={chrome.items.get(pair.right)} onPlay={chrome.onPlay} />
            </div>
            {pair.note ? (
              <p dir="rtl" className="mt-1 text-center text-xs text-v2-ink-muted">
                <RichText segments={pair.note} />
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
