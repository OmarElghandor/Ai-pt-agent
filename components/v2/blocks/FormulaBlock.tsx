'use client';

import { RichText } from '@/components/v2/RichText';
import type { Block } from '@/lib/v2/content/blocks';
import type { RtSegment } from '@/lib/v2/content/rt';
import { ContentLine } from './content';
import { useBlockChrome } from './chrome';
import { partClass } from './visibility';

export function FormulaBlock({ block }: { block: Extract<Block, { type: 'formula' }> }) {
  const chrome = useBlockChrome();
  const state = chrome.partState(block.id, null);
  const pattern = chrome.items.get(block.pattern);
  const slots = pattern?.type === 'pattern' ? pattern.slots : [];

  return (
    <div
      data-target={block.id}
      className={['space-y-2 rounded-v2-card border border-v2-ink bg-v2-card p-3', partClass(state)].join(' ')}
    >
      <div className="flex flex-wrap items-center gap-1.5" dir="ltr">
        {slots.map((slot, index) => {
          if ('tl' in slot) {
            return (
              <span
                key={index}
                className="font-[family-name:var(--font-v2-target)] text-lg text-v2-ink"
              >
                {slot.tl}
              </span>
            );
          }
          const seg: RtSegment = {
            text: slot.name_eg,
            lang: 'eg',
            group: slot.group,
          };
          return (
            <span key={index} className="rounded-v2-chip border border-dashed border-v2-ink px-2 py-0.5">
              <RichText segments={[seg]} />
            </span>
          );
        })}
      </div>
      {(block.examples ?? []).map((ref) => (
        <ContentLine key={ref} item={chrome.items.get(ref)} onPlay={chrome.onPlay} />
      ))}
    </div>
  );
}
