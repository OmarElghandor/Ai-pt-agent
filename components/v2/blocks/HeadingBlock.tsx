'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function HeadingBlock({ block }: { block: Extract<Block, { type: 'heading' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <h2
      data-target={block.id}
      dir="rtl"
      className={[
        'rounded-v2-row px-1 text-start font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink',
        partClass(state),
      ].join(' ')}
    >
      <RichText segments={block.text} />
    </h2>
  );
}
