'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function RulesListBlock({ block }: { block: Extract<Block, { type: 'rules_list' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  return (
    <ol
      data-target={block.id}
      className={['space-y-2 rounded-v2-card bg-v2-card p-4 shadow-[var(--shadow-v2-soft)]', partClass(state)].join(' ')}
    >
      {block.items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm">
          <span className="font-[family-name:var(--font-v2-ui)] font-semibold text-v2-ink-muted">
            {index + 1}
          </span>
          <RichText segments={item} />
        </li>
      ))}
    </ol>
  );
}
