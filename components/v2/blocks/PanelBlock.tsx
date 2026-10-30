'use client';

import { ImageSlot } from '@/components/v2/ImageSlot';
import type { Block } from '@/lib/v2/content/blocks';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function PanelBlock({ block }: { block: Extract<Block, { type: 'panel' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div
      data-target={block.id}
      className={['space-y-2 rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]', partClass(state)].join(' ')}
    >
      <ImageSlot variant="cover" />
      {block.image ? <span className="sr-only">{block.image}</span> : null}
      {block.lines.map((ref) => (
        <ContentLine key={ref} item={chrome.items.get(ref)} onPlay={chrome.onPlay} />
      ))}
    </div>
  );
}
