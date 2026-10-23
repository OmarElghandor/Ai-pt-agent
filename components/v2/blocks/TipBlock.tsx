'use client';

import { RichText } from '@/components/v2/RichText';
import { StickyNote } from '@/components/v2/StickyNote';
import type { Block } from '@/lib/v2/content/blocks';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

const KIND_LABEL = {
  rule: 'قاعدة',
  culture: 'ثقافة',
  warning: 'خلي بالك',
} as const;

export function TipBlock({ block }: { block: Extract<Block, { type: 'tip' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <div data-target={block.id} className={partClass(state)}>
      <StickyNote>
        <span className="font-semibold">
          {KIND_LABEL[block.kind]}
          {' · '}
          <RichText segments={block.title} />
        </span>
        <span className="mt-1 block">
          <RichText segments={block.body} />
        </span>
      </StickyNote>
    </div>
  );
}
