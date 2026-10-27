'use client';

import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function DialogueBlock({ block }: { block: Extract<Block, { type: 'dialogue' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div
      data-target={block.id}
      className={['space-y-2 rounded-v2-card border border-v2-ink bg-v2-card p-3', partClass(state)].join(' ')}
    >
      {block.lines.map((ref) => {
        const item = chrome.items.get(ref);
        const speaker = item && 'speaker' in item ? item.speaker : undefined;
        return (
          <div key={ref}>
            {speaker ? (
              <p className="font-[family-name:var(--font-v2-ui)] text-[11px] text-v2-ink-muted">{speaker}</p>
            ) : null}
            <ContentLine item={item} onPlay={chrome.onPlay} />
          </div>
        );
      })}
    </div>
  );
}
